import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import Sentiment from "sentiment";
import { GoogleGenAI } from "@google/genai";

const JWT_SECRET = process.env.JWT_SECRET || "zintox_secret_key_change_in_prod";

// @ts-ignore
const sentiment = new (Sentiment.default || Sentiment)();

let aiClient: GoogleGenAI | null = null;
export function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

export interface AuthRequest extends Request {
  user?: any;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Access denied. Token missing." });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token." });
    req.user = user;
    next();
  });
}

export function generateToken(user: any) {
  return jwt.sign({ id: user.id, handle: user.handle }, JWT_SECRET, { expiresIn: '7d' });
}

export function analyzeEmotion(text: string): 'happy' | 'sad' | 'angry' | 'neutral' {
  try {
    if (!text || typeof text !== 'string') return 'neutral';
    const result = sentiment.analyze(text);
    const score = result?.score || 0;

    const angryKeywords = ['hate', 'angry', 'mad', 'annoyed', 'furious', 'stop', 'shut up'];
    const lowercaseText = text.toLowerCase();
    const isAngry = angryKeywords.some(word => lowercaseText.includes(word));

    if (isAngry || score <= -4) return 'angry';
    if (score > 1) return 'happy';
    if (score < -1) return 'sad';
  } catch (e) {
    console.error("Sentiment analysis error:", e);
  }
  return 'neutral';
}

// Case-insensitive/driver-compatibility Row Mappers
export const mapUser = (u: any) => {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    handle: u.handle,
    avatarColor: u.avatarcolor || u.avatarColor,
    accountType: u.accounttype || u.accountType,
    lastSeen: u.lastseen || u.lastSeen,
    password: u.password
  };
};

export const mapMessage = (m: any) => {
  if (!m) return null;
  return {
    id: m.id,
    senderId: m.senderid || m.senderId,
    receiverId: m.receiverid || m.receiverId,
    content: m.content,
    isSnap: m.issnap !== undefined ? (typeof m.issnap === 'boolean' ? (m.issnap ? 1 : 0) : m.issnap) : m.isSnap,
    snapTimer: m.snaptimer !== undefined ? m.snaptimer : m.snapTimer,
    openedAt: m.openedat || m.openedAt,
    emotion: m.emotion,
    timestamp: m.timestamp
  };
};
