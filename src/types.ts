export interface User {
  id: string;
  username: string;
  email: string;
  handle?: string;
  avatarColor: string;
  status?: 'online' | 'offline';
  accountType?: 'public' | 'private';
}

export type RelationshipStatus = 'not_following' | 'requested' | 'following' | 'blocked';

export type SentimentEmotion = 'happy' | 'sad' | 'angry' | 'neutral';

export interface Message {
  id: number;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
  isSnap?: boolean;
  snapTimer?: number;
  openedAt?: string;
  emotion?: SentimentEmotion;
}

export interface Story {
  id: number;
  userId: string;
  username: string;
  avatarColor: string;
  content: string;
  timestamp: string;
  expiresAt: string;
  seenBy?: string; // JSON string from DB, needs parsing or handling as string
}

export interface Comment {
  id: number;
  userId: string;
  username: string;
  postId: number;
  content: string;
  timestamp: string;
}

export interface Post {
  id: number;
  userId: string;
  username: string;
  avatarColor: string;
  imageUrl: string;
  caption: string;
  timestamp: string;
  likes: string[]; // array of userIds
  comments: Comment[];
}
