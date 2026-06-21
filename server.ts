import express, { Response } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

// Import Postgres Database Configuration and Helpers
import { dbPool, initDatabase } from "./src/db.ts";
import { 
  getGeminiClient, 
  authenticateToken, 
  generateToken, 
  analyzeEmotion, 
  mapUser, 
  mapMessage, 
  AuthRequest 
} from "./src/helpers.ts";
import { 
  getRelationshipStatus, 
  isBlocked, 
  checkAccess, 
  createNotification, 
  generateHandle, 
  updateStreak 
} from "./src/social.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.floor(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

async function startServer() {
  // Initialize Database Schema
  await initDatabase();

  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e8 // 100MB to handle large snap photos
  });

  const activeUsers = new Map<string, string>();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use('/uploads', express.static(uploadsDir));

  app.use("/api", (req, res, next) => {
    if (process.env.NODE_ENV !== "production") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    next();
  });

  // --- API Routes ---

  app.get("/api/stories", authenticateToken, async (req, res) => {
    const viewerId = (req.query.viewerId as string) || (req as AuthRequest).user?.id;
    if (!viewerId) return res.status(400).json({ error: "viewerId required" });

    try {
      const storiesRes = await dbPool.query(`
        SELECT s.*, u.username, u.avatarColor as "avatarColor"
        FROM stories s 
        JOIN users u ON s.userId = u.id 
        WHERE s.expiresAt > CURRENT_TIMESTAMP
        ORDER BY s.timestamp DESC
      `);
      const stories = storiesRes.rows;

      const filteredStories = [];
      for (const s of stories) {
        if (await checkAccess(viewerId as string, s.userid || s.userId)) {
          const rawSeenBy = s.seenby || s.seenBy;
          let parsedSeenBy: string[] = [];
          if (Array.isArray(rawSeenBy)) {
            parsedSeenBy = rawSeenBy;
          } else if (typeof rawSeenBy === 'string' && rawSeenBy.trim()) {
            try {
              parsedSeenBy = JSON.parse(rawSeenBy);
            } catch (err) {
              parsedSeenBy = [];
            }
          }

          filteredStories.push({
            id: s.id,
            userId: s.userid || s.userId,
            content: s.content,
            timestamp: s.timestamp,
            expiresAt: s.expiresat || s.expiresAt,
            seenBy: parsedSeenBy,
            username: s.username,
            avatarColor: s.avatarcolor || s.avatarColor
          });
        }
      }
      res.json(filteredStories);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/stories", authenticateToken, async (req, res) => {
    const { userId, content } = req.body;
    try {
      await dbPool.query(
        "INSERT INTO stories (userId, content, expiresAt) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '1 day')",
        [userId, content]
      );
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/messages/:msgId/open", authenticateToken, async (req, res) => {
    try {
      await dbPool.query("UPDATE messages SET openedAt = CURRENT_TIMESTAMP WHERE id = $1", [req.params.msgId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/streaks/:userA/:userB", authenticateToken, async (req, res) => {
    const [u1, u2] = [req.params.userA, req.params.userB].sort();
    try {
      const streakRes = await dbPool.query(
        "SELECT count FROM streaks WHERE userA = $1 AND userB = $2",
        [u1, u2]
      );
      const streak = streakRes.rows[0];
      res.json(streak ? { count: streak.count } : { count: 0 });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/follow/:userId", authenticateToken, async (req, res) => {
    const { followerId } = req.body;
    const { userId: followingId } = req.params;
    if (followerId === followingId) return res.status(400).json({ error: "Cannot follow yourself" });

    try {
      const targetUserRes = await dbPool.query("SELECT accountType FROM users WHERE id = $1", [followingId]);
      const targetUser = targetUserRes.rows[0];
      if (!targetUser) return res.status(404).json({ error: "User not found" });

      const accountType = targetUser.accounttype || targetUser.accountType;
      if (accountType === 'private') {
        await dbPool.query(
          "INSERT INTO follow_requests (senderId, receiverId) VALUES ($1, $2) ON CONFLICT (senderId, receiverId) DO NOTHING",
          [followerId, followingId]
        );
        await createNotification(followingId, followerId, 'follow_request', io, activeUsers);
        res.json({ success: true, status: 'requested' });
      } else {
        await dbPool.query(
          "INSERT INTO follows (followerId, followingId) VALUES ($1, $2) ON CONFLICT (followerId, followingId) DO NOTHING",
          [followerId, followingId]
        );
        await createNotification(followingId, followerId, 'follow', io, activeUsers);
        res.json({ success: true, status: 'following' });
      }
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/unfollow/:userId", authenticateToken, async (req: AuthRequest, res) => {
    const { followerId } = req.body;
    if (req.user.id !== followerId) return res.status(403).json({ error: "Unauthorized unfollow" });
    const { userId: followingId } = req.params;
    if (followerId === followingId) return res.status(400).json({ error: "Cannot unfollow yourself" });

    try {
      await dbPool.query("DELETE FROM follows WHERE followerId = $1 AND followingId = $2", [followerId, followingId]);
      await dbPool.query("DELETE FROM follow_requests WHERE senderId = $1 AND receiverId = $2", [followerId, followingId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/relationship-status/:followerId/:followingId", async (req, res) => {
    const { followerId, followingId } = req.params;
    try {
      const chatReqRes = await dbPool.query(
        "SELECT * FROM friend_requests WHERE (senderId = $1 AND receiverId = $2) OR (senderId = $3 AND receiverId = $4)",
        [followerId, followingId, followingId, followerId]
      );
      const chatReq = chatReqRes.rows[0];
      let chatStatus = 'none';
      if (chatReq) {
        const senderId = chatReq.senderid || chatReq.senderId;
        const status = chatReq.status;
        if (status === 'accepted') {
          chatStatus = 'friends';
        } else if (senderId === followerId) {
          chatStatus = 'pending_sent';
        } else {
          chatStatus = 'pending_received';
        }
      }
      
      const relStatus = await getRelationshipStatus(followerId, followingId);
      res.json({ 
        status: relStatus, 
        chatStatus 
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/follow-request/:requestId/accept", authenticateToken, async (req, res) => {
    const { requestId } = req.params;
    try {
      const requestRes = await dbPool.query("SELECT * FROM follow_requests WHERE id = $1", [requestId]);
      const request = requestRes.rows[0];
      if (request) {
        const senderId = request.senderid || request.senderId;
        const receiverId = request.receiverid || request.receiverId;
        await dbPool.query(
          "INSERT INTO follows (followerId, followingId) VALUES ($1, $2) ON CONFLICT (followerId, followingId) DO NOTHING",
          [senderId, receiverId]
        );
        await dbPool.query("DELETE FROM follow_requests WHERE id = $1", [requestId]);
        await createNotification(senderId, receiverId, 'follow_accept', io, activeUsers);
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/follow-request/:requestId/reject", authenticateToken, async (req, res) => {
    const { requestId } = req.params;
    try {
      await dbPool.query("DELETE FROM follow_requests WHERE id = $1", [requestId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/follow-requests/:userId", authenticateToken, async (req, res) => {
    const { userId } = req.params;
    try {
      const requestsRes = await dbPool.query(`
        SELECT r.*, u.username, u.avatarColor as "avatarColor"
        FROM follow_requests r 
        JOIN users u ON r.senderId = u.id 
        WHERE r.receiverId = $1 AND r.status = 'pending'
      `, [userId]);
      const rows = requestsRes.rows.map(r => ({
        id: r.id,
        senderId: r.senderid || r.senderId,
        receiverId: r.receiverid || r.receiverId,
        status: r.status,
        timestamp: r.timestamp,
        username: r.username,
        avatarColor: r.avatarcolor || r.avatarColor
      }));
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/block/:userId", authenticateToken, async (req, res) => {
    const { blockerId } = req.body;
    const { userId: blockedId } = req.params;
    if (blockerId === blockedId) return res.status(400).json({ error: "Cannot block yourself" });

    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      
      await client.query(
        "INSERT INTO blocks (blockerId, blockedId) VALUES ($1, $2) ON CONFLICT (blockerId, blockedId) DO NOTHING",
        [blockerId, blockedId]
      );
      
      // Automatically unfollow both ways
      await client.query(
        "DELETE FROM follows WHERE (followerId = $1 AND followingId = $2) OR (followerId = $3 AND followingId = $4)",
        [blockerId, blockedId, blockedId, blockerId]
      );
      
      // Remove pending follow requests both ways
      await client.query(
        "DELETE FROM follow_requests WHERE (senderId = $1 AND receiverId = $2) OR (senderId = $3 AND receiverId = $4)",
        [blockerId, blockedId, blockedId, blockerId]
      );

      await client.query("COMMIT");
      res.json({ success: true });
    } catch (e: any) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  app.post("/api/unblock/:userId", authenticateToken, async (req: AuthRequest, res) => {
    const { blockerId } = req.body;
    if (req.user.id !== blockerId) return res.status(403).json({ error: "Unauthorized unblock" });
    const { userId: blockedId } = req.params;
    try {
      await dbPool.query("DELETE FROM blocks WHERE blockerId = $1 AND blockedId = $2", [blockerId, blockedId]);
      
      // Notify both parties for real-time update
      const blockerSocket = activeUsers.get(blockerId);
      const blockedSocket = activeUsers.get(blockedId);
      
      const blockerRel = await getRelationshipStatus(blockerId, blockedId);
      const blockedRel = await getRelationshipStatus(blockedId, blockerId);
      
      if (blockerSocket) io.to(blockerSocket).emit("relationshipUpdate", { targetId: blockedId, status: blockerRel });
      if (blockedSocket) io.to(blockedSocket).emit("relationshipUpdate", { targetId: blockerId, status: blockedRel });
      
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/blocked-users/:userId", authenticateToken, async (req, res) => {
    const { userId } = req.params;
    try {
      const blockedRes = await dbPool.query(`
        SELECT u.id, u.username, u.avatarColor as "avatarColor"
        FROM blocks b 
        JOIN users u ON b.blockedId = u.id 
        WHERE b.blockerId = $1
      `, [userId]);
      const list = blockedRes.rows.map(u => ({
        id: u.id,
        username: u.username,
        avatarColor: u.avatarcolor || u.avatarColor
      }));
      res.json(list);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/following/:userId", authenticateToken, async (req, res) => {
    const { userId } = req.params;
    try {
      const followingRes = await dbPool.query(`
        SELECT u.id, u.username, u.avatarColor as "avatarColor"
        FROM follows f
        JOIN users u ON f.followingId = u.id
        WHERE f.followerId = $1
      `, [userId]);
      const following = followingRes.rows.map(u => ({
        id: u.id,
        username: u.username,
        avatarColor: u.avatarcolor || u.avatarColor
      }));
      res.json(following);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/social-counts/:userId", async (req, res) => {
    const { userId } = req.params;
    try {
      const followersRes = await dbPool.query("SELECT COUNT(*) as count FROM follows WHERE followingId = $1", [userId]);
      const followingRes = await dbPool.query("SELECT COUNT(*) as count FROM follows WHERE followerId = $1", [userId]);
      const followersCount = parseInt(followersRes.rows[0].count, 10);
      const followingCount = parseInt(followingRes.rows[0].count, 10);
      res.json({ followers: followersCount, following: followingCount });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/is-following/:followerId/:followingId", async (req, res) => {
    const { followerId, followingId } = req.params;
    try {
      const existsRes = await dbPool.query("SELECT 1 FROM follows WHERE followerId = $1 AND followingId = $2", [followerId, followingId]);
      res.json({ isFollowing: existsRes.rows.length > 0 });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // --- Friend Requests ---
  app.post("/api/friend-request/:userId", authenticateToken, async (req, res) => {
    const { senderId } = req.body;
    const { userId: receiverId } = req.params;
    try {
      await dbPool.query(
        "INSERT INTO friend_requests (senderId, receiverId) VALUES ($1, $2) ON CONFLICT (senderId, receiverId) DO NOTHING",
        [senderId, receiverId]
      );
      await createNotification(receiverId, senderId, 'friend_request', io, activeUsers);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/friend-request/:requestId/accept", authenticateToken, async (req, res) => {
    const { requestId } = req.params;
    try {
      const requestRes = await dbPool.query("SELECT * FROM friend_requests WHERE id = $1", [requestId]);
      const request = requestRes.rows[0];
      if (request) {
        const senderId = request.senderid || request.senderId;
        const receiverId = request.receiverid || request.receiverId;

        await dbPool.query("UPDATE friend_requests SET status = 'accepted' WHERE id = $1", [requestId]);
        // Mutual follow for friends
        await dbPool.query(
          "INSERT INTO follows (followerId, followingId) VALUES ($1, $2) ON CONFLICT (followerId, followingId) DO NOTHING",
          [senderId, receiverId]
        );
        await dbPool.query(
          "INSERT INTO follows (followerId, followingId) VALUES ($1, $2) ON CONFLICT (followerId, followingId) DO NOTHING",
          [receiverId, senderId]
        );
        await createNotification(senderId, receiverId, 'friend_accept', io, activeUsers);
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/friend-request/:requestId/reject", authenticateToken, async (req, res) => {
    const { requestId } = req.params;
    try {
      await dbPool.query("DELETE FROM friend_requests WHERE id = $1", [requestId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/friend-requests/:userId", authenticateToken, async (req, res) => {
    const { userId } = req.params;
    try {
      const requestsRes = await dbPool.query(`
        SELECT r.*, u.username, u.avatarColor as "avatarColor"
        FROM friend_requests r 
        JOIN users u ON r.senderId = u.id 
        WHERE r.receiverId = $1 AND r.status = 'pending'
      `, [userId]);
      const rows = requestsRes.rows.map(r => ({
        id: r.id,
        senderId: r.senderid || r.senderId,
        receiverId: r.receiverid || r.receiverId,
        status: r.status,
        timestamp: r.timestamp,
        username: r.username,
        avatarColor: r.avatarcolor || r.avatarColor
      }));
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // --- Core Chat & Friend Request APIs ---

  const sendRequestHandler = async (req: AuthRequest, res: Response) => {
    const senderId = req.user.id;
    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).json({ error: "Receiver ID is required" });
    }
    if (senderId === receiverId) {
      return res.status(400).json({ error: "You cannot send a request to yourself" });
    }

    try {
      if (await isBlocked(senderId, receiverId) || await isBlocked(receiverId, senderId)) {
        return res.status(400).json({ error: "Cannot send request. Blocking relation exists." });
      }

      // Check if they are already connected as friends or in chats
      const existingChatRes = await dbPool.query(
        "SELECT 1 FROM chats WHERE (userOne = $1 AND userTwo = $2) OR (userOne = $3 AND userTwo = $4)",
        [senderId, receiverId, receiverId, senderId]
      );
      if (existingChatRes.rows.length > 0) {
        return res.status(400).json({ error: "You are already chatting with this user." });
      }

      // Check existing pending request
      const existingRequestRes = await dbPool.query(
        "SELECT * FROM friend_requests WHERE (senderId = $1 AND receiverId = $2) OR (senderId = $3 AND receiverId = $4)",
        [senderId, receiverId, receiverId, senderId]
      );
      const existingRequest = existingRequestRes.rows[0];
      if (existingRequest) {
        if (existingRequest.status === 'accepted') {
          return res.status(400).json({ error: "Request already accepted" });
        }
        const sId = existingRequest.senderid || existingRequest.senderId;
        if (sId === senderId) {
          return res.status(400).json({ error: "You have already sent a pending request to this user" });
        } else {
          return res.status(400).json({ error: "This user has already sent a request to you" });
        }
      }

      const info = await dbPool.query(
        "INSERT INTO friend_requests (senderId, receiverId, status) VALUES ($1, $2, 'pending') RETURNING id",
        [senderId, receiverId]
      );
      const insertedId = info.rows[0].id;

      await createNotification(receiverId, senderId, 'friend_request', io, activeUsers);

      // Emit realtime socket event so the receiver learns about this request instantly
      const receiverSocketId = activeUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("friendRequestReceived", {
          id: Number(insertedId),
          senderId,
          receiverId,
          status: 'pending',
          username: req.user.handle ? req.user.handle.split('@')[0] : req.user.id,
          avatarColor: '#4f46e5',
          timestamp: new Date().toISOString()
        });
      }

      res.json({ success: true, message: "Chat request sent successfully!" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };

  const getRequestsHandler = async (req: AuthRequest, res: Response) => {
    const userId = req.user.id;
    try {
      const requestsRes = await dbPool.query(`
        SELECT r.*, u.username, u.avatarColor as "avatarColor", u.email, u.handle 
        FROM friend_requests r 
        JOIN users u ON r.senderId = u.id 
        WHERE r.receiverId = $1 AND r.status = 'pending'
      `, [userId]);
      const mapped = requestsRes.rows.map(r => ({
        id: r.id,
        senderId: r.senderid || r.senderId,
        receiverId: r.receiverid || r.receiverId,
        status: r.status,
        timestamp: r.timestamp,
        username: r.username,
        avatarColor: r.avatarcolor || r.avatarColor,
        email: r.email,
        handle: r.handle
      }));
      res.json(mapped);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };

  const acceptRequestHandler = async (req: AuthRequest, res: Response) => {
    const userId = req.user.id;
    const { requestId, senderId } = req.body;

    try {
      let request: any;
      if (requestId) {
        const resSet = await dbPool.query("SELECT * FROM friend_requests WHERE id = $1", [requestId]);
        request = resSet.rows[0];
      } else if (senderId) {
        const resSet = await dbPool.query(
          "SELECT * FROM friend_requests WHERE senderId = $1 AND receiverId = $2 AND status = 'pending'",
          [senderId, userId]
        );
        request = resSet.rows[0];
      }

      if (!request) {
        return res.status(404).json({ error: "Chat request not found" });
      }

      const receiverId = request.receiverid || request.receiverId;
      const rId = request.id;
      const sId = request.senderid || request.senderId;

      if (receiverId !== userId) {
        return res.status(403).json({ error: "You are not authorized to accept this request" });
      }

      // Update friend request status
      await dbPool.query("UPDATE friend_requests SET status = 'accepted' WHERE id = $1", [rId]);

      // Create entries in chats table
      const u1 = sId;
      const u2 = receiverId;
      const first = u1 < u2 ? u1 : u2;
      const second = u1 < u2 ? u2 : u1;
      
      await dbPool.query(
        "INSERT INTO chats (userOne, userTwo) VALUES ($1, $2) ON CONFLICT (userOne, userTwo) DO NOTHING",
        [first, second]
      );

      // Mutual follow for compatibility
      await dbPool.query(
        "INSERT INTO follows (followerId, followingId) VALUES ($1, $2) ON CONFLICT (followerId, followingId) DO NOTHING",
        [u1, u2]
      );
      await dbPool.query(
        "INSERT INTO follows (followerId, followingId) VALUES ($1, $2) ON CONFLICT (followerId, followingId) DO NOTHING",
        [u2, u1]
      );

      await createNotification(sId, receiverId, 'friend_accept', io, activeUsers);

      const senderUserRes = await dbPool.query("SELECT id, username, email, handle, avatarColor as \"avatarColor\" FROM users WHERE id = $1", [u1]);
      const receiverUserRes = await dbPool.query("SELECT id, username, email, handle, avatarColor as \"avatarColor\" FROM users WHERE id = $1", [u2]);
      const senderUser = senderUserRes.rows[0];
      const receiverUser = receiverUserRes.rows[0];

      // Socket IO realtime notify
      const senderSocketId = activeUsers.get(u1);
      const receiverSocketId = activeUsers.get(u2);
      
      if (senderSocketId) {
        io.to(senderSocketId).emit("chatRequestAccepted", {
          chatWith: senderUser ? { ...senderUser, avatarColor: senderUser.avatarColor || senderUser.avatarcolor } : null,
          requestId: rId
        });
      }
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("chatRequestAccepted", {
          chatWith: receiverUser ? { ...receiverUser, avatarColor: receiverUser.avatarColor || receiverUser.avatarcolor } : null,
          requestId: rId
        });
      }

      res.json({ success: true, message: "Chat request accepted!" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };

  const rejectRequestHandler = async (req: AuthRequest, res: Response) => {
    const userId = req.user.id;
    const { requestId, senderId } = req.body;

    try {
      let request: any;
      if (requestId) {
        const resSet = await dbPool.query("SELECT * FROM friend_requests WHERE id = $1", [requestId]);
        request = resSet.rows[0];
      } else if (senderId) {
        const resSet = await dbPool.query(
          "SELECT * FROM friend_requests WHERE senderId = $1 AND receiverId = $2 AND status = 'pending'",
          [senderId, userId]
        );
        request = resSet.rows[0];
      }

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      const receiverId = request.receiverid || request.receiverId;
      const rId = request.id;

      if (receiverId !== userId) {
        return res.status(403).json({ error: "You are not authorized to reject this request" });
      }

      await dbPool.query("DELETE FROM friend_requests WHERE id = $1", [rId]);

      res.json({ success: true, message: "Chat request rejected" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };

  const getChatsHandler = async (req: AuthRequest, res: Response) => {
    const userId = req.user.id;
    try {
      const activeChatsRes = await dbPool.query(`
        SELECT u.*, r.status
        FROM users u
        JOIN friend_requests r ON (r.senderId = u.id AND r.receiverId = $1) OR (r.receiverId = u.id AND r.senderId = $2)
        WHERE r.status = 'accepted'
      `, [userId, userId]);
      
      const activeChats = activeChatsRes.rows.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        handle: u.handle,
        avatarColor: u.avatarcolor || u.avatarColor,
        accountType: u.accounttype || u.accountType,
        lastSeen: u.lastseen || u.lastSeen,
        status: u.status
      }));
      
      // Always include 'ai-assistant'
      const aiAssistantRes = await dbPool.query("SELECT * FROM users WHERE id = 'ai-assistant'");
      const aiAssistant = aiAssistantRes.rows[0];
      if (aiAssistant) {
        const exists = activeChats.some(u => u.id === 'ai-assistant');
        if (!exists) {
          activeChats.push({
            id: aiAssistant.id,
            username: aiAssistant.username,
            email: aiAssistant.email,
            handle: aiAssistant.handle,
            avatarColor: aiAssistant.avatarcolor || aiAssistant.avatarColor,
            accountType: aiAssistant.accounttype || aiAssistant.accountType,
            lastSeen: aiAssistant.lastseen || aiAssistant.lastSeen,
            status: 'accepted'
          });
        }
      }
      
      res.json(activeChats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };

  // Mount prefixed and clean paths
  app.post("/api/send-request", authenticateToken, sendRequestHandler);
  app.post("/send-request", authenticateToken, sendRequestHandler);

  app.get("/api/requests", authenticateToken, getRequestsHandler);
  app.get("/requests", authenticateToken, getRequestsHandler);

  app.post("/api/accept-request", authenticateToken, acceptRequestHandler);
  app.post("/accept-request", authenticateToken, acceptRequestHandler);

  app.post("/api/reject-request", authenticateToken, rejectRequestHandler);
  app.post("/reject-request", authenticateToken, rejectRequestHandler);

  app.get("/api/chats", authenticateToken, getChatsHandler);
  app.get("/chats", authenticateToken, getChatsHandler);

  // --- Notifications ---
  app.get("/api/notifications/:userId", authenticateToken, async (req, res) => {
    const { userId } = req.params;
    try {
      const notificationsRes = await dbPool.query(`
        SELECT n.*, u.username as "fromUsername", u.avatarColor as "fromAvatarColor"
        FROM notifications n 
        JOIN users u ON n.fromUserId = u.id 
        WHERE n.userId = $1 
        ORDER BY n.timestamp DESC LIMIT 20
      `, [userId]);
      const rows = notificationsRes.rows.map(n => ({
        id: n.id,
        userId: n.userid || n.userId,
        fromUserId: n.fromuserid || n.fromUserId,
        type: n.type,
        isRead: n.isread || n.isRead,
        timestamp: n.timestamp,
        fromUsername: n.fromUsername,
        fromAvatarColor: n.fromAvatarColor
      }));
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/notifications/:userId/read", async (req, res) => {
    const { userId } = req.params;
    try {
      await dbPool.query("UPDATE notifications SET isRead = 1 WHERE userId = $1", [userId]);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/users", authenticateToken, async (req, res) => {
    const viewerId = (req.query.viewerId as string) || (req as AuthRequest).user?.id;
    try {
      const usersRes = await dbPool.query("SELECT * FROM users");
      let users = usersRes.rows.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        handle: u.handle,
        avatarColor: u.avatarcolor || u.avatarColor,
        accountType: u.accounttype || u.accountType,
        lastSeen: u.lastseen || u.lastSeen
      }));
      if (viewerId) {
        const filtered = [];
        for (const u of users) {
          if (!(await isBlocked(viewerId, u.id))) {
            filtered.push(u);
          }
        }
        users = filtered;
      }
      res.json(users);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/me", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userRes = await dbPool.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
      const user = userRes.rows[0];
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        handle: user.handle,
        avatarColor: user.avatarcolor || user.avatarColor,
        accountType: user.accounttype || user.accountType,
        lastSeen: user.lastseen || user.lastSeen
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/login", async (req, res) => {
    const { username, email, identifier, password } = req.body;
    
    const loginIdentifier = identifier || email;
    
    if (!loginIdentifier) return res.status(400).json({ error: "Identifier required" });

    const colors = ["#4f46e5", "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];
    
    try {
      let finalIdentifier = loginIdentifier.toLowerCase().trim();
      
      if (!finalIdentifier.includes("@")) {
        finalIdentifier = `${finalIdentifier}@gmail.com`;
      }

      const userRes = await dbPool.query("SELECT * FROM users WHERE handle = $1", [finalIdentifier]);
      const user = userRes.rows[0];
      
      if (user) {
        if (user.password) {
          if (!password) {
            return res.status(400).json({ error: "Password is required for this account" });
          }
          const isMatch = bcrypt.compareSync(password, user.password);
          if (!isMatch) {
            return res.status(401).json({ error: "Incorrect password" });
          }
        }
        
        const mappedUser = {
          id: user.id,
          username: user.username,
          email: user.email,
          handle: user.handle,
          avatarColor: user.avatarcolor || user.avatarColor,
          accountType: user.accounttype || user.accountType,
          lastSeen: user.lastseen || user.lastSeen
        };
        const token = generateToken(mappedUser);
        res.json({ user: mappedUser, token });
      } else {
        if (username && email) {
          const id = Math.random().toString(36).substr(2, 9);
          const handle = await generateHandle(username);
          const passwordHash = password ? bcrypt.hashSync(password, 10) : null;
          await dbPool.query(
            "INSERT INTO users (id, username, email, handle, avatarColor, password) VALUES ($1, $2, $3, $4, $5, $6)",
            [id, username, email.toLowerCase(), handle, avatarColor, passwordHash]
          );
          
          const newUserRes = await dbPool.query("SELECT * FROM users WHERE id = $1", [id]);
          const newUser = newUserRes.rows[0];
          const mappedNewUser = {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            handle: newUser.handle,
            avatarColor: newUser.avatarcolor || newUser.avatarColor,
            accountType: newUser.accounttype || newUser.accountType,
            lastSeen: newUser.lastseen || newUser.lastSeen
          };
          const token = generateToken(mappedNewUser);
          res.json({ user: mappedNewUser, token });
        } else {
          res.status(404).json({ error: "User not found. Please sign up." });
        }
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/signup", async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email) return res.status(400).json({ error: "Username and email required" });

    const colors = ["#4f46e5", "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];

    try {
      const existingUserRes = await dbPool.query("SELECT 1 FROM users WHERE email = $1", [email]);
      if (existingUserRes.rows.length > 0) return res.status(400).json({ error: "Email already exists" });

      const id = Math.random().toString(36).substr(2, 9);
      const handle = await generateHandle(username);
      const passwordHash = password ? bcrypt.hashSync(password, 10) : null;
      await dbPool.query(
        "INSERT INTO users (id, username, email, handle, avatarColor, password) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, username, email.toLowerCase(), handle, avatarColor, passwordHash]
      );
      
      const newUserRes = await dbPool.query("SELECT * FROM users WHERE id = $1", [id]);
      const newUser = newUserRes.rows[0];
      const mappedNewUser = {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        handle: newUser.handle,
        avatarColor: newUser.avatarcolor || newUser.avatarColor,
        accountType: newUser.accounttype || newUser.accountType,
        lastSeen: newUser.lastseen || newUser.lastSeen
      };
      const token = generateToken(mappedNewUser);
      res.json({ user: mappedNewUser, token });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Database error during signup" });
    }
  });

  app.get("/api/messages/:u1/:u2", authenticateToken, async (req, res) => {
    const { u1, u2 } = req.params;
    
    try {
      const isFriendRes = await dbPool.query(
        "SELECT 1 FROM friend_requests WHERE ((senderId = $1 AND receiverId = $2) OR (senderId = $3 AND receiverId = $4)) AND status = 'accepted'",
        [u1, u2, u2, u1]
      );
      const isFriend = isFriendRes.rows.length > 0;
      const isAi = u1 === 'ai-assistant' || u2 === 'ai-assistant';
      if (!isFriend && u1 !== u2 && !isAi) {
        return res.json([]);
      }

      const messagesRes = await dbPool.query(`
        SELECT * FROM messages 
        WHERE (senderId = $1 AND receiverId = $2) 
        OR (senderId = $3 AND receiverId = $4)
        ORDER BY timestamp ASC
      `, [u1, u2, u2, u1]);
      
      const messages = messagesRes.rows.map(m => mapMessage(m));
      res.json(messages);
    } catch (eValue: any) {
      res.status(500).json({ error: eValue.message });
    }
  });

  // Delete messages
  app.delete("/api/messages/item/:msgId", authenticateToken, async (req: AuthRequest, res) => {
    const { msgId } = req.params;
    const userId = req.user.id;
    try {
      const messageRes = await dbPool.query("SELECT * FROM messages WHERE id = $1", [msgId]);
      const message = messageRes.rows[0];
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }
      
      const senderId = message.senderid || message.senderId;
      const receiverId = message.receiverid || message.receiverId;

      if (senderId !== userId && receiverId !== userId) {
        return res.status(403).json({ error: "Unauthorized to delete this message" });
      }

      await dbPool.query("DELETE FROM messages WHERE id = $1", [msgId]);

      const otherId = senderId === userId ? receiverId : senderId;
      const otherSocketId = activeUsers.get(otherId);
      if (otherSocketId) {
        io.to(otherSocketId).emit("messageDeleted", { msgId: Number(msgId) });
      }

      res.json({ success: true, msgId: Number(msgId) });
    } catch (e: any) {
      console.error("Delete single message error:", e);
      res.status(500).json({ error: "Failed to delete message: " + e.message });
    }
  });

  app.delete("/api/messages/:otherId", authenticateToken, async (req: AuthRequest, res) => {
    const userId = req.user.id;
    const { otherId } = req.params;
    console.log(`Deleting messages between authenticated user ${userId} and target ${otherId}`);
    try {
      const info = await dbPool.query(`
        DELETE FROM messages 
        WHERE (senderId = $1 AND receiverId = $2) 
        OR (senderId = $3 AND receiverId = $4)
      `, [userId, otherId, otherId, userId]);
      console.log(`Deleted ${info.rowCount} messages`);
      res.json({ success: true, count: info.rowCount });
    } catch (e: any) {
      console.error("Delete messages error:", e);
      res.status(500).json({ error: "Failed to delete messages: " + e.message });
    }
  });

  const handleAIAssistantResponse = async (userId: string, userMessage: string) => {
    try {
      const aiInstance = getGeminiClient();
      
      const response = await aiInstance.models.generateContent({
        model: "gemini-3.5-flash",
        contents: userMessage,
      });
      
      const aiText = response.text || "I'm thinking...";
      const emotion = analyzeEmotion(aiText);
      const info = await dbPool.query(
        "INSERT INTO messages (senderId, receiverId, content, isSnap, snapTimer, emotion) VALUES ($1, $2, $3, 0, 0, $4) RETURNING id",
        ['ai-assistant', userId, aiText, emotion]
      );
      
      const aiPayload = {
        id: Number(info.rows[0].id),
        senderId: 'ai-assistant',
        receiverId: userId,
        content: aiText,
        isSnap: false,
        snapTimer: 0,
        emotion,
        timestamp: new Date().toISOString()
      };
      
      const userSocketId = activeUsers.get(userId);
      if (userSocketId) {
        io.to(userSocketId).emit("newMessage", aiPayload);
      }
    } catch (err: any) {
      console.warn("Gemini AI generation failed (expected if API key is missing or revoked):", err.message || err);
      let fallbackText = `Sorry, I encountered an issue: ${err.message || "Please check your GEMINI_API_KEY."}`;
      if (err.message && err.message.toLowerCase().includes("leaked")) {
        fallbackText = `⚠️ **Gemini API Key Error**: Your current API key has been flagged as leaked and is disabled by Google's security systems.
        
To fix this and restore AI chat:
1. Go to **Google AI Studio** (https://aistudio.google.com/).
2. Create or obtain a new **Gemini API Key**.
3. In this workspace, open the **Settings** menu at the top-right/bottom-left, and update your **GEMINI_API_KEY** with the new value.`;
      }
      const emotion = 'sad';
      const info = await dbPool.query(
        "INSERT INTO messages (senderId, receiverId, content, isSnap, snapTimer, emotion) VALUES ($1, $2, $3, 0, 0, $4) RETURNING id",
        ['ai-assistant', userId, fallbackText, emotion]
      );
      
      const fallbackPayload = {
        id: Number(info.rows[0].id),
        senderId: 'ai-assistant',
        receiverId: userId,
        content: fallbackText,
        isSnap: false,
        snapTimer: 0,
        emotion,
        timestamp: new Date().toISOString()
      };
      
      const userSocketId = activeUsers.get(userId);
      if (userSocketId) {
        io.to(userSocketId).emit("newMessage", fallbackPayload);
      }
    }
  };

  io.on("connection", (socket) => {
    socket.on("join", (userId) => {
      activeUsers.set(userId, socket.id);
      io.emit("userStatus", { userId, status: "online" });
    });

    socket.on("sendMessage", async (data) => {
      console.log("Received sendMessage:", data);
      try {
        const { senderId, receiverId, content, isSnap, snapTimer } = data;
        if (!senderId || !receiverId || !content) {
          console.error("Missing required message fields:", { senderId, receiverId, hasContent: !!content });
          return;
        }

        if (await isBlocked(senderId, receiverId)) {
          console.log(`Message blocked between ${senderId} and ${receiverId}`);
          return;
        }

        const isFriendRes = await dbPool.query(
          "SELECT 1 FROM friend_requests WHERE ((senderId = $1 AND receiverId = $2) OR (senderId = $3 AND receiverId = $4)) AND status = 'accepted'",
          [senderId, receiverId, receiverId, senderId]
        );
        const isFriend = isFriendRes.rows.length > 0;
        const isAi = senderId === 'ai-assistant' || receiverId === 'ai-assistant';
        if (!isFriend && senderId !== receiverId && !isAi) {
          console.log(`Chat blocked: no accepted request between ${senderId} and ${receiverId}`);
          return;
        }

        const emotion = analyzeEmotion(content);
        console.log("Analyzed emotion:", emotion);
        const info = await dbPool.query(
          "INSERT INTO messages (senderId, receiverId, content, isSnap, snapTimer, emotion) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
          [senderId, receiverId, content, isSnap ? 1 : 0, snapTimer || 0, emotion]
        );
        const insertedId = info.rows[0].id;
        
        const payload = { 
          ...data, 
          id: Number(insertedId), 
          isSnap: !!isSnap, 
          snapTimer: snapTimer || 0,
          emotion,
          timestamp: new Date().toISOString() 
        };
        
        console.log("Emitting newMessage:", payload);
        await updateStreak(senderId, receiverId);
        
        const receiverSocketId = activeUsers.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("newMessage", payload);
        }
        
        socket.emit("newMessage", payload); 

        if (receiverId === 'ai-assistant') {
          handleAIAssistantResponse(senderId, content);
        }
      } catch (err) {
        console.error("Socket error in sendMessage:", err);
      }
    });

    socket.on("messageOpened", ({ msgId, receiverId }) => {
      const receiverSocketId = activeUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("snapOpened", { msgId });
      }
    });

    socket.on("typing", (data) => {
      const receiverSocketId = activeUsers.get(data.receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("userTyping", { userId: data.senderId });
      }
    });

    socket.on("deleteChat", (data) => {
      const { userId, otherId } = data;
      const receiverSocketId = activeUsers.get(otherId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("chatDeleted", { fromId: userId });
      }
    });

    // --- Audio Call Signaling ---
    socket.on("call-user", async (data) => {
      const { to, from, offer, callerName, isVideo } = data;
      if (await isBlocked(from, to)) return;
      const receiverSocketId = activeUsers.get(to);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("incoming-call", { from, offer, callerName, isVideo });
      }
    });

    socket.on("answer-call", (data) => {
      const { to, answer } = data;
      const callerSocketId = activeUsers.get(to);
      if (callerSocketId) {
        io.to(callerSocketId).emit("call-accepted", { answer });
      }
    });

    socket.on("ice-candidate", (data) => {
      const { to, candidate } = data;
      const receiverSocketId = activeUsers.get(to);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("ice-candidate", { candidate });
      }
    });

    socket.on("reject-call", (data) => {
      const { to } = data;
      const callerSocketId = activeUsers.get(to);
      if (callerSocketId) {
        io.to(callerSocketId).emit("call-rejected");
      }
    });

    socket.on("end-call", (data) => {
      const { to } = data;
      const otherSocketId = activeUsers.get(to);
      if (otherSocketId) {
        io.to(otherSocketId).emit("call-ended");
      }
    });

    socket.on("disconnect", () => {
      let disconnectedId = null;
      for (const [userId, socketId] of activeUsers.entries()) {
        if (socketId === socket.id) {
          disconnectedId = userId;
          activeUsers.delete(userId);
          break;
        }
      }
      if (disconnectedId) {
        io.emit("userStatus", { userId: disconnectedId, status: "offline" });
      }
    });
  });

  // --- Feed APIs ---
  app.post("/api/posts", upload.single('image'), async (req, res) => {
    const { userId, caption } = req.body;
    const imageUrl = `/uploads/${req.file?.filename}`;
    
    try {
      const info = await dbPool.query(
        "INSERT INTO posts (userId, imageUrl, caption) VALUES ($1, $2, $3) RETURNING id",
        [userId, imageUrl, caption]
      );
      res.json({ id: info.rows[0].id, userId, imageUrl, caption, likes: [], comments: [] });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/posts", authenticateToken, async (req, res) => {
    const viewerId = (req.query.viewerId as string) || (req as AuthRequest).user?.id;
    if (!viewerId) return res.status(400).json({ error: "viewerId required" });

    try {
      const postsRes = await dbPool.query(`
        SELECT p.*, u.username, u.avatarColor as "avatarColor"
        FROM posts p 
        JOIN users u ON p.userId = u.id 
        ORDER BY p.timestamp DESC
      `);
      const posts = postsRes.rows;

      const result = [];
      for (const post of posts) {
        const pId = post.id;
        const uId = post.userid || post.userId;
        if (await checkAccess(viewerId as string, uId)) {
          const likesRes = await dbPool.query("SELECT userId as \"userId\" FROM likes WHERE postId = $1", [pId]);
          const commentsRes = await dbPool.query(`
            SELECT c.*, u.username 
            FROM comments c 
            JOIN users u ON c.userId = u.id 
            WHERE c.postId = $1 
            ORDER BY c.timestamp ASC
          `, [pId]);

          result.push({
            id: pId,
            userId: uId,
            imageUrl: post.imageurl || post.imageUrl,
            caption: post.caption,
            timestamp: post.timestamp,
            expiresAt: post.expiresat || post.expiresAt,
            username: post.username,
            avatarColor: post.avatarcolor || post.avatarColor,
            likes: likesRes.rows.map((l: any) => l.userId || l.userid),
            comments: commentsRes.rows.map(c => ({
              id: c.id,
              userId: c.userid || c.userId,
              postId: c.postid || c.postId,
              content: c.content,
              timestamp: c.timestamp,
              username: c.username
            }))
          });
        }
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/posts/:postId", authenticateToken, async (req: AuthRequest, res) => {
    const { postId } = req.params;
    const client = await dbPool.connect();
    let inTransaction = false;
    try {
      const id = Number(postId);
      console.log(`[Delete Post] Attempting to delete post id: ${id} for user: ${req.user.id}`);
      
      const postRes = await client.query("SELECT * FROM posts WHERE id = $1", [id]);
      const post = postRes.rows[0];
      if (!post) {
        console.warn(`[Delete Post] Post ${id} not found in database.`);
        return res.status(404).json({ error: "Post not found" });
      }
      
      const pUserId = post.userId || post.userid || post.UserId || post.UserID;
      const pImageUrl = post.imageUrl || post.imageurl || post.ImageUrl || post.ImageURL;
      console.log(`[Delete Post] Found post in database. Owner: ${pUserId}, Image: ${pImageUrl}`);

      if (pUserId !== req.user.id) {
        console.warn(`[Delete Post] Handshake mismatch! Logged user ${req.user.id} !== Owner ${pUserId}`);
        return res.status(403).json({ error: "Unauthorized" });
      }

      if (pImageUrl) {
        const filename = pImageUrl.split('/').pop();
        if (filename) {
          const filePath = path.join(uploadsDir, filename);
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
              console.log(`[Delete Post] Successfully deleted image file: ${filePath}`);
            } catch (fsErr) {
              console.error(`[Delete Post] Failed to delete image file: ${filePath}`, fsErr);
            }
          }
        }
      }
      
      await client.query("BEGIN");
      inTransaction = true;
      
      await client.query("DELETE FROM likes WHERE postId = $1", [id]);
      await client.query("DELETE FROM comments WHERE postId = $1", [id]);
      await client.query("DELETE FROM posts WHERE id = $1", [id]);
      
      await client.query("COMMIT");
      inTransaction = false;
      
      console.log(`[Delete Post] Successfully deleted post ${id} and associated likes/comments.`);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[Delete Post] Exception caught in handler:", err);
      if (inTransaction) {
        try {
          await client.query("ROLLBACK");
          console.log("[Delete Post] Transaction rolled back safely.");
        } catch (rollbackErr) {
          console.error("[Delete Post] Failed to rollback transaction:", rollbackErr);
        }
      }
      res.status(500).json({ error: err.message || "Failed to delete post" });
    } finally {
      client.release();
    }
  });

  app.delete("/api/stories/:storyId", authenticateToken, async (req: AuthRequest, res) => {
    const { storyId } = req.params;
    try {
      const id = Number(storyId);
      const storyRes = await dbPool.query("SELECT * FROM stories WHERE id = $1", [id]);
      const story = storyRes.rows[0];
      if (!story) return res.status(404).json({ error: "Story not found" });
      
      const sUserId = story.userId || story.userid || story.UserId || story.UserID;
      if (sUserId !== req.user.id) return res.status(403).json({ error: "Unauthorized" });

      await dbPool.query("DELETE FROM stories WHERE id = $1", [id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/posts/:postId/like", authenticateToken, async (req, res) => {
    const { userId } = req.body;
    const { postId } = req.params;
    
    try {
      await dbPool.query("INSERT INTO likes (userId, postId) VALUES ($1, $2)", [userId, postId]);
      res.json({ success: true, liked: true });
    } catch (err) {
      try {
        await dbPool.query("DELETE FROM likes WHERE userId = $1 AND postId = $2", [userId, postId]);
        res.json({ success: true, liked: false });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    }
  });

  app.post("/api/posts/:postId/comments", async (req, res) => {
    const { userId, content } = req.body;
    const { postId } = req.params;
    
    try {
      const info = await dbPool.query(
        "INSERT INTO comments (userId, postId, content) VALUES ($1, $2, $3) RETURNING id",
        [userId, postId, content]
      );
      const insertedId = info.rows[0].id;
      
      const commentRes = await dbPool.query(`
        SELECT c.*, u.username 
        FROM comments c 
        JOIN users u ON c.userId = u.id 
        WHERE c.id = $1
      `, [insertedId]);
      
      const c = commentRes.rows[0];
      res.json({
        id: c.id,
        userId: c.userid || c.userId,
        postId: c.postid || c.postId,
        content: c.content,
        timestamp: c.timestamp,
        username: c.username
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/users/:userId/posts", authenticateToken, async (req, res) => {
    const { userId } = req.params;
    const viewerId = (req.query.viewerId as string) || (req as AuthRequest).user?.id;
    if (!viewerId) return res.status(400).json({ error: "viewerId required" });

    try {
      if (!(await checkAccess(viewerId as string, userId))) {
        return res.json([]);
      }

      const postsRes = await dbPool.query(`
        SELECT p.*, u.username, u.avatarColor as "avatarColor"
        FROM posts p 
        JOIN users u ON p.userId = u.id 
        WHERE p.userId = $1
        ORDER BY p.timestamp DESC
      `, [userId]);
      const posts = postsRes.rows;

      const result = [];
      for (const post of posts) {
        const pId = post.id;
        const likesRes = await dbPool.query("SELECT userId FROM likes WHERE postId = $1", [pId]);
        const commentsRes = await dbPool.query(`
          SELECT c.*, u.username 
          FROM comments c 
          JOIN users u ON c.userId = u.id 
          WHERE c.postId = $1 
          ORDER BY c.timestamp ASC
        `, [pId]);

        result.push({
          id: pId,
          userId: post.userid || post.userId,
          imageUrl: post.imageurl || post.imageUrl,
          caption: post.caption,
          timestamp: post.timestamp,
          expiresAt: post.expiresat || post.expiresAt,
          username: post.username,
          avatarColor: post.avatarcolor || post.avatarColor,
          likes: likesRes.rows.map((l: any) => l.userid || l.userId),
          comments: commentsRes.rows.map(c => ({
            id: c.id,
            userId: c.userid || c.userId,
            postId: c.postid || c.postId,
            content: c.content,
            timestamp: c.timestamp,
            username: c.username
          }))
        });
      }

      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/users/:userId/privacy", authenticateToken, async (req, res) => {
    const { userId } = req.params;
    const { accountType } = req.body;
    if (accountType !== 'public' && accountType !== 'private') {
      return res.status(400).json({ error: "Invalid account type" });
    }
    try {
      await dbPool.query("UPDATE users SET accountType = $1 WHERE id = $2", [accountType, userId]);
      res.json({ success: true, accountType });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/stories/:storyId/seen", authenticateToken, async (req, res) => {
    const { storyId } = req.params;
    const { userId } = req.body;
    try {
      const storyRes = await dbPool.query("SELECT seenBy FROM stories WHERE id = $1", [storyId]);
      const story = storyRes.rows[0];
      if (story) {
        const rawSeenBy = story.seenby || story.seenBy;
        let seenBy: string[] = [];
        if (Array.isArray(rawSeenBy)) {
          seenBy = rawSeenBy;
        } else if (typeof rawSeenBy === 'string' && rawSeenBy.trim()) {
          try {
            seenBy = JSON.parse(rawSeenBy);
          } catch (err) {
            seenBy = [];
          }
        }
        if (!Array.isArray(seenBy)) {
          seenBy = [];
        }
        if (!seenBy.includes(userId)) {
          seenBy.push(userId);
          await dbPool.query("UPDATE stories SET seenBy = $1 WHERE id = $2", [JSON.stringify(seenBy), storyId]);
        }
      }
      res.json({ success: true });
    } catch (eValue: any) { res.status(500).json({ error: eValue.message }); }
  });

  app.get("/api/stories/:storyId/viewers", async (req, res) => {
    const { storyId } = req.params;
    try {
      const storyRes = await dbPool.query("SELECT seenBy FROM stories WHERE id = $1", [storyId]);
      const story = storyRes.rows[0];
      if (!story) return res.status(404).json({ error: "Story not found" });
      
      const rawSeenBy = story.seenby || story.seenBy;
      let seenBy: string[] = [];
      if (Array.isArray(rawSeenBy)) {
        seenBy = rawSeenBy;
      } else if (typeof rawSeenBy === 'string' && rawSeenBy.trim()) {
        try {
          seenBy = JSON.parse(rawSeenBy);
        } catch (err) {
          seenBy = [];
        }
      }
      if (!Array.isArray(seenBy)) {
        seenBy = [];
      }
      if (seenBy.length === 0) return res.json([]);

      const params = seenBy;
      const placeholders = seenBy.map((_: any, idx: number) => `$${idx + 1}`).join(',');
      const viewersRes = await dbPool.query(`
        SELECT id, username, avatarColor as "avatarColor" FROM users WHERE id IN (${placeholders})
      `, params);
      
      const viewers = viewersRes.rows.map(u => ({
        id: u.id,
        username: u.username,
        avatarColor: u.avatarcolor || u.avatarColor
      }));
      res.json(viewers);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put("/api/users/:userId", authenticateToken, async (req: AuthRequest, res) => {
    const { userId } = req.params;
    if (req.user.id !== userId) return res.status(403).json({ error: "Unauthorized profile update" });
    const { username, email, avatarColor } = req.body;
    try {
      await dbPool.query("UPDATE users SET username = $1, email = $2, avatarColor = $3 WHERE id = $4", [username, email, avatarColor, userId]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/users/:userId", authenticateToken, async (req: AuthRequest, res) => {
    const { userId } = req.params;
    if (req.user.id !== userId) return res.status(403).json({ error: "Unauthorized account termination" });
    console.log(`Backend: Received request to delete user ${userId}`);
    
    const client = await dbPool.connect();
    try {
      const postsRes = await client.query("SELECT imageUrl as \"imageUrl\" FROM posts WHERE userId = $1", [userId]);
      const posts = postsRes.rows;
      posts.forEach(post => {
        const imageUrl = post.imageUrl || post.imageurl;
        if (imageUrl) {
          const filename = imageUrl.split('/').pop();
          const filePath = filename ? path.join(uploadsDir, filename) : null;
          if (filePath && fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch (err) {
              console.error(`Failed to delete file ${filePath}:`, err);
            }
          }
        }
      });

      await client.query("BEGIN");
      
      await client.query("DELETE FROM comments WHERE userId = $1", [userId]);
      await client.query("DELETE FROM likes WHERE userId = $1", [userId]);
      await client.query("DELETE FROM posts WHERE userId = $1", [userId]);
      await client.query("DELETE FROM stories WHERE userId = $1", [userId]);
      await client.query("DELETE FROM follows WHERE followerId = $1 OR followingId = $2", [userId, userId]);
      await client.query("DELETE FROM follow_requests WHERE senderId = $1 OR receiverId = $2", [userId, userId]);
      await client.query("DELETE FROM friend_requests WHERE senderId = $1 OR receiverId = $2", [userId, userId]);
      await client.query("DELETE FROM blocks WHERE blockerId = $1 OR blockedId = $2", [userId, userId]);
      await client.query("DELETE FROM streaks WHERE userA = $1 OR userB = $2", [userId, userId]);
      await client.query("DELETE FROM notifications WHERE userId = $1 OR fromUserId = $2", [userId, userId]);
      await client.query("DELETE FROM messages WHERE senderId = $1 OR receiverId = $2", [userId, userId]);
      
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
      
      await client.query("COMMIT");
      
      console.log(`Backend: Successfully deleted user ${userId}`);
      res.json({ success: true });
    } catch (e: any) {
      await client.query("ROLLBACK");
      console.error("Account deletion error at backend:", e);
      res.status(500).json({ error: e.message || "Internal server error during deletion" });
    } finally {
      client.release();
    }
  });

  // Notification Clean-up task (every hour)
  setInterval(async () => {
    try {
      const result = await dbPool.query("DELETE FROM notifications WHERE timestamp < NOW() - INTERVAL '1 day'");
      if (result.rowCount !== null && result.rowCount > 0) {
        console.log(`Deleted ${result.rowCount} old notifications`);
      }
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  }, 3600000);

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Zintox Server running on http://localhost:${PORT}`);
  });
}

startServer();
