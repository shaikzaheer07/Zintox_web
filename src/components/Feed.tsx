import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, MessageCircle, Send, MoreHorizontal, X, Upload, Image as ImageIcon, Trash2 } from 'lucide-react';
import { Post, User, Comment } from '../types';
import { cn, getInitials, formatTime } from '../lib/utils';
import { getApiUrl } from '../config';

interface PostCardProps {
  post: Post;
  currentUser: User;
  onLike: (postId: number) => void;
  onComment: (postId: number, content: string) => void;
  onDelete?: (postId: number) => void;
  onProfileClick?: (userId: string) => void;
}

export const PostCard: React.FC<PostCardProps> = ({ post, currentUser, onLike, onComment, onDelete, onProfileClick }) => {
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const isLiked = post.likes.includes(currentUser.id);

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    onComment(post.id, commentInput);
    setCommentInput('');
  };

  const isOwner = currentUser.id === post.userId;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-bg-side border border-white/5 rounded-3xl overflow-hidden shadow-xl mb-8"
    >
      {/* Post Header */}
      <div className="p-3 md:p-4 flex items-center justify-between relative">
        <div 
          className="flex items-center gap-2 md:gap-3 cursor-pointer group"
          onClick={() => onProfileClick?.(post.userId)}
        >
          <div 
            className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center text-white font-bold text-xs md:text-sm transition-transform group-hover:scale-105"
            style={{ backgroundColor: post.avatarColor }}
          >
            {getInitials(post.username)}
          </div>
          <div>
            <p className="text-xs md:text-sm font-bold text-white leading-tight group-hover:text-indigo-400 transition-colors">{post.username}</p>
            <p className="text-[9px] md:text-[10px] text-gray-500 font-bold uppercase tracking-widest">{formatTime(post.timestamp)}</p>
          </div>
        </div>
        <div className="relative">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="text-gray-500 hover:text-white transition-colors p-1"
          >
            <MoreHorizontal size={18} />
          </button>
          
          <AnimatePresence>
            {showMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowMenu(false)} 
                />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 mt-2 w-48 bg-bg-deep border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                >
                  {isOwner ? (
                    <button 
                      onClick={() => {
                        if (window.confirm('Are you sure you want to delete this post?')) {
                          onDelete?.(post.id);
                        }
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-500/10 transition-colors text-sm font-bold"
                    >
                      <Trash2 size={16} />
                      Delete Post
                    </button>
                  ) : (
                    <div className="px-4 py-3 text-gray-500 text-xs font-bold uppercase tracking-widest text-center">
                      No actions available
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Post Image */}
      <div className="aspect-square bg-bg-item flex items-center justify-center overflow-hidden">
        <img 
          src={post.imageUrl} 
          alt="Post content" 
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>

      {/* Post Actions */}
      <div className="p-3 md:p-4">
        <div className="flex items-center gap-4 mb-3 md:mb-4">
          <button 
            onClick={() => onLike(post.id)}
            className={cn(
              "transition-all active:scale-90",
              isLiked ? "text-red-500" : "text-gray-400 hover:text-white"
            )}
          >
            <Heart size={22} className="md:w-6 md:h-6" fill={isLiked ? "currentColor" : "none"} />
          </button>
          <button 
            onClick={() => setShowComments(!showComments)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <MessageCircle size={22} className="md:w-6 md:h-6" />
          </button>
          <button className="text-gray-400 hover:text-white transition-colors">
            <Send size={22} className="md:w-6 md:h-6" />
          </button>
        </div>

        {/* Likes Count */}
        {post.likes.length > 0 && (
          <p className="text-xs md:text-sm font-bold text-white mb-1.5 md:mb-2">
            {post.likes.length} {post.likes.length === 1 ? 'like' : 'likes'}
          </p>
        )}

        {/* Caption */}
        {post.caption && (
          <p className="text-xs md:text-sm text-gray-300 leading-relaxed">
            <span className="font-bold text-white mr-1.5">{post.username}</span>
            {post.caption}
          </p>
        )}

        {/* Comments Preview */}
        {post.comments.length > 0 && !showComments && (
          <button 
            onClick={() => setShowComments(true)}
            className="text-xs text-gray-500 font-bold mt-2 hover:text-gray-400"
          >
            View all {post.comments.length} comments
          </button>
        )}

        {/* Comments Section */}
        <AnimatePresence>
          {showComments && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mt-4 pt-4 border-t border-white/5"
            >
              <div className="space-y-3 max-h-40 overflow-y-auto custom-scroll pr-2 mb-4">
                {post.comments.map(comment => (
                  <div key={comment.id} className="text-xs">
                    <span className="font-bold text-white mr-2">{comment.username}</span>
                    <span className="text-gray-400">{comment.content}</span>
                  </div>
                ))}
              </div>
              <form onSubmit={handleCommentSubmit} className="flex gap-2">
                <input 
                  type="text"
                  placeholder="Add a comment..."
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/5 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-indigo-500/50 transition-all"
                />
                <button 
                  type="submit"
                  disabled={!commentInput.trim()}
                  className="text-indigo-400 font-bold text-xs disabled:opacity-30"
                >
                  Post
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onUploadSuccess: () => void;
}

export function UploadModal({ isOpen, onClose, currentUser, onUploadSuccess }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
    }
  };

  const handleUpload = async () => {
    if (!file || !currentUser) return;
    setIsUploading(true);

    const formData = new FormData();
    formData.append('image', file);
    formData.append('userId', currentUser.id);
    formData.append('caption', caption);

    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(getApiUrl('/api/posts'), {
        method: 'POST',
        headers,
        body: formData,
      });
      if (res.ok) {
        onUploadSuccess();
        handleClose();
      }
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview(null);
    setCaption('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg bg-bg-side border border-white/10 rounded-[32px] overflow-hidden shadow-2xl"
          >
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-xl font-black text-white">Create New Post</h2>
              <button 
                onClick={handleClose}
                className="p-2 text-gray-500 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              {!preview ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-all group"
                >
                  <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-gray-500 group-hover:scale-110 transition-transform mb-4">
                    <Upload size={32} />
                  </div>
                  <p className="text-sm font-bold text-white">Select an image</p>
                  <p className="text-xs text-gray-500 mt-1">High resolution photos preferred</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="aspect-square relative rounded-2xl overflow-hidden shadow-2xl">
                    <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => { setFile(null); setPreview(null); }}
                      className="absolute top-4 right-4 p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-red-500 transition-all"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <textarea 
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Write a caption..."
                    className="w-full h-24 bg-white/5 border border-white/5 rounded-2xl p-4 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500/50 transition-all resize-none"
                  />
                </div>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
              />
            </div>

            <div className="p-6 border-t border-white/5 bg-black/20">
              <button 
                onClick={handleUpload}
                disabled={!file || isUploading}
                className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-600/20 disabled:opacity-50 disabled:grayscale transition-all active:scale-[0.98]"
              >
                {isUploading ? 'Sharing your moment...' : 'Share Post'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
