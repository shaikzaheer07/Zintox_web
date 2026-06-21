import React from 'react';
import { UserCheck, UserPlus, UserX, X, Bell, User as UserIcon, Flame, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getInitials } from '../lib/utils';
import { User, RelationshipStatus } from '../types';

export interface Notification {
  id: number;
  userId: string;
  fromUserId: string;
  fromUsername: string;
  fromAvatarColor: string;
  type: 'follow' | 'friend_request' | 'friend_accept' | 'follow_request' | 'follow_accept';
  timestamp: string;
  isRead: number;
}

export interface FriendRequest {
  id: number;
  senderId: string;
  receiverId: string;
  username: string;
  avatarColor: string;
  status: string;
}

interface SocialProps {
  currentUser: User;
  onClose: () => void;
}

export function SocialModals({ currentUser, onClose }: SocialProps) {
  return null; // Placeholder
}

export function FollowButton({ 
  status, 
  onToggle, 
  loading 
}: { 
  status: RelationshipStatus, 
  onToggle: () => void, 
  loading?: boolean 
}) {
  if (status === 'blocked') {
    return (
      <div className="px-4 py-2 rounded-xl text-xs font-bold bg-white/5 text-gray-500 border border-white/10 flex items-center justify-center gap-2">
        <UserX size={14} /> User Blocked
      </div>
    );
  }

  return (
    <button
      onClick={onToggle}
      disabled={loading || status === 'requested'}
      className={cn(
        "px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2",
        status === 'following' 
          ? "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10" 
          : status === 'requested'
          ? "bg-white/5 text-gray-500 border border-white/10 cursor-default"
          : "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700"
      )}
    >
      {status === 'following' ? "Following" : status === 'requested' ? <><Clock size={14} /> Requested</> : "Follow"}
    </button>
  );
}

export function FriendRequestButton({
  status, // 'none', 'pending', 'friends'
  onAction,
  loading
}: {
  status: 'none' | 'pending' | 'friends',
  onAction: () => void,
  loading?: boolean
}) {
  if (status === 'friends') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl text-xs font-bold">
        <UserCheck size={14} /> Friends
      </div>
    );
  }

  return (
    <button
      onClick={onAction}
      disabled={loading || status === 'pending'}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95",
        status === 'pending'
          ? "bg-white/5 text-gray-500 border border-white/10 cursor-default"
          : "bg-white/5 text-indigo-400 border border-indigo-400/20 hover:bg-indigo-400/10"
      )}
    >
      {status === 'pending' ? <><UserCheck size={14} /> Requested</> : <><UserPlus size={14} /> Add Friend</>}
    </button>
  );
}
