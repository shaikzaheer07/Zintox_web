import { Server } from "socket.io";
import { dbPool } from "./db.ts";

export async function getRelationshipStatus(followerId: string, followingId: string): Promise<string> {
  if (followerId === followingId) return 'following';
  
  // Check if either user has blocked the other
  const blocked = await dbPool.query(
    "SELECT 1 FROM blocks WHERE (blockerId = $1 AND blockedId = $2) OR (blockerId = $3 AND blockedId = $4)",
    [followerId, followingId, followingId, followerId]
  );
  if (blocked.rows.length > 0) return 'blocked';

  const following = await dbPool.query(
    "SELECT 1 FROM follows WHERE followerId = $1 AND followingId = $2",
    [followerId, followingId]
  );
  if (following.rows.length > 0) return 'following';

  const requested = await dbPool.query(
    "SELECT 1 FROM follow_requests WHERE senderId = $1 AND receiverId = $2",
    [followerId, followingId]
  );
  if (requested.rows.length > 0) return 'requested';

  return 'not_following';
}

export async function isBlocked(userId: string, targetId: string): Promise<boolean> {
  const result = await dbPool.query(
    "SELECT 1 FROM blocks WHERE (blockerId = $1 AND blockedId = $2) OR (blockerId = $3 AND blockedId = $4)",
    [userId, targetId, targetId, userId]
  );
  return result.rows.length > 0;
}

export async function checkAccess(viewerId: string, targetId: string): Promise<boolean> {
  if (viewerId === targetId) return true;
  if (await isBlocked(viewerId, targetId)) return false;
  
  const targetUserRes = await dbPool.query("SELECT accountType FROM users WHERE id = $1", [targetId]);
  const targetUser = targetUserRes.rows[0];
  if (!targetUser) return true;
  const accountType = targetUser.accounttype || targetUser.accountType;
  if (!accountType || accountType === 'public') return true;

  const relationship = await getRelationshipStatus(viewerId, targetId);
  return relationship === 'following';
}

export async function createNotification(userId: string, fromUserId: string, type: string, io: Server, activeUsers: Map<string, string>) {
  const info = await dbPool.query(
    "INSERT INTO notifications (userId, fromUserId, type) VALUES ($1, $2, $3) RETURNING id",
    [userId, fromUserId, type]
  );
  const fromUserRes = await dbPool.query("SELECT * FROM users WHERE id = $1", [fromUserId]);
  const fromUser = fromUserRes.rows[0];
  const payload = {
    id: info.rows[0].id,
    userId,
    fromUserId,
    fromUsername: fromUser?.username,
    fromAvatarColor: fromUser?.avatarcolor || fromUser?.avatarColor,
    type,
    timestamp: new Date().toISOString(),
    isRead: 0
  };
  
  const socketId = activeUsers.get(userId);
  if (socketId) {
    io.to(socketId).emit("notification", payload);
  }
}

export async function generateHandle(username: string): Promise<string> {
  const base = username.toLowerCase().replace(/\s+/g, '');
  const suffix = "@gmail.com";
  let handle = `${base}${suffix}`;
  let counter = 1;
  
  while (true) {
    const check = await dbPool.query("SELECT 1 FROM users WHERE handle = $1", [handle]);
    if (check.rows.length === 0) break;
    handle = `${base}${counter}${suffix}`;
    counter++;
  }
  
  return handle;
}

export async function updateStreak(userA: string, userB: string): Promise<number> {
  const [u1, u2] = [userA, userB].sort();
  const existingRes = await dbPool.query("SELECT * FROM streaks WHERE userA = $1 AND userB = $2", [u1, u2]);
  const existing = existingRes.rows[0];
  const now = new Date();
  
  if (!existing) {
    await dbPool.query(
      "INSERT INTO streaks (userA, userB, count, lastActivity) VALUES ($1, $2, 1, $3)",
      [u1, u2, now]
    );
    return 1;
  }
  
  const count = existing.count;
  const lastActivity = existing.lastactivity || existing.lastActivity;
  const lastDate = new Date(lastActivity);
  const hoursSince = (now.getTime() - lastDate.getTime()) / 3600000;
  
  if (hoursSince < 24) return count;
  if (hoursSince < 48) {
    const newCount = count + 1;
    await dbPool.query(
      "UPDATE streaks SET count = $1, lastActivity = $2 WHERE userA = $3 AND userB = $4",
      [newCount, now, u1, u2]
    );
    return newCount;
  }
  
  await dbPool.query(
    "UPDATE streaks SET count = 1, lastActivity = $1 WHERE userA = $2 AND userB = $3",
    [now, u1, u2]
  );
  return 1;
}
