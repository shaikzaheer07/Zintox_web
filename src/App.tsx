import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Search, MoreVertical, MessageSquare, Phone, Video, Send, LogOut, Trash2, Home, Compass, Camera, ChevronLeft, ChevronRight, Flame, Eye, X, RefreshCw, Bell, UserPlus, UserCheck, UserX, Plus, Heart, MessageCircle, Image as ImageIcon, Lock, Settings, Palette, User as UserIcon, CheckCircle2, Mail, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Message, Story, Post, Comment, SentimentEmotion, RelationshipStatus } from './types';
import { cn, getInitials, formatTime } from './lib/utils';
import { FollowButton, FriendRequestButton, Notification, FriendRequest } from './components/Social';
import { PostCard, UploadModal } from './components/Feed';
import { getApiUrl } from './config';
import api from './lib/api';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [identifierInput, setIdentifierInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [signupSuccess, setSignupSuccess] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [chatList, setChatList] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'home' | 'explore' | 'snap' | 'chat' | 'profile'>('home');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isTyping, setIsTyping] = useState<string | null>(null);
  const [lastEmotion, setLastEmotion] = useState<SentimentEmotion>('neutral');
  const [exploreSearchQuery, setExploreSearchQuery] = useState('');
  const [profileUser, setProfileUser] = useState<User | null>(null);
  
  // Real-time Features
  const [stories, setStories] = useState<Story[]>([]);
  const [streak, setStreak] = useState<number>(0);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [activeSnap, setActiveSnap] = useState<Message | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'snap' | 'story'>('snap');
  const [isSnapEnabled, setIsSnapEnabled] = useState(false);
  const [snapTimer, setSnapTimer] = useState(5);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [showRecipientSelection, setShowRecipientSelection] = useState(false);
  const [followingUsers, setFollowingUsers] = useState<User[]>([]);
  const [storyViewers, setStoryViewers] = useState<User[]>([]);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({ username: '', email: '', avatarColor: '' });
  const [profileTheme, setProfileTheme] = useState<'normal' | 'glass'>('normal');
  const [appLoading, setAppLoading] = useState(true);

  // Social Features State
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showBlockedList, setShowBlockedList] = useState(false);
  const [socialCounts, setSocialCounts] = useState({ followers: 0, following: 0 });
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
  } | null>(null);
  const [relationshipStatus, setRelationshipStatus] = useState<RelationshipStatus>('not_following');
  const [chatRelationshipStatus, setChatRelationshipStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'friends'>('none');
  const [followRequests, setFollowRequests] = useState<any[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<User[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);
  
  // Feed State
  const [posts, setPosts] = useState<Post[]>([]);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Call States
  const [callState, setCallState] = useState<'idle' | 'calling' | 'incoming' | 'ongoing'>('idle');
  const [callData, setCallData] = useState<{ toId?: string, fromId?: string, callerName?: string, offer?: any, isVideo?: boolean }>({});
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);
  const selectedUserRef = useRef<User | null>(null);
  const profileUserRef = useRef<User | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  useEffect(() => {
    profileUserRef.current = profileUser;
  }, [profileUser]);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await api.get('/api/me');
          setCurrentUser(res.data);
          setProfileUser(res.data);
        } catch (err) {
          console.error("Auth check failed:", err);
          localStorage.removeItem('token');
        }
      }
      setAppLoading(false);
    };
    checkAuth();
  }, []);

  useEffect(() => {
    if (currentUser) {
      const socket = io(getApiUrl(''), {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
      });
      socketRef.current = socket;
      
      socket.on('connect', () => {
        setSocketConnected(true);
        socket.emit('join', currentUser.id);
      });

      socket.on('disconnect', () => setSocketConnected(false));
      socket.on('connect_error', (err) => console.error("Socket Connection Error:", err));

      socket.on('newMessage', (msg: Message) => {
        setMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          const currentSelected = selectedUserRef.current;
          const isRelevant = 
            (msg.senderId === currentSelected?.id && msg.receiverId === currentUser.id) ||
            (msg.senderId === currentUser.id && msg.receiverId === currentSelected?.id);
          return isRelevant ? [...prev, msg] : prev;
        });
      });

      socket.on('notification', (notif: Notification) => {
        setNotifications(prev => [notif, ...prev]);
        if (notif.type === 'friend_request') fetchFriendRequests();
      });

      socket.on('friendRequestReceived', (data) => {
        fetchFriendRequests();
      });

      socket.on('chatRequestAccepted', (data) => {
        fetchActiveChats();
      });

      socket.on('snapOpened', ({ msgId }) => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, openedAt: new Date().toISOString() } : m));
      });

      socket.on('userTyping', ({ userId }) => {
        if (selectedUserRef.current?.id === userId) {
          setIsTyping(userId);
          setTimeout(() => setIsTyping(null), 3000);
        }
      });

      socket.on('userStatus', ({ userId, status }) => {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, status } : u));
      });

      socket.on('chatDeleted', ({ fromId }) => {
        if (selectedUserRef.current?.id === fromId) {
          setMessages([]);
        }
      });

      socket.on('messageDeleted', ({ msgId }) => {
        setMessages(prev => prev.filter(msg => msg.id !== msgId));
      });

      socket.on('incoming-call', ({ from, offer, callerName, isVideo }) => {
        setCallData({ fromId: from, callerName, offer, isVideo });
        setIsVideoCall(!!isVideo);
        setCallState('incoming');
      });

      socket.on('call-accepted', async ({ answer }) => {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          setCallState('ongoing');
          startCallTimer();
        }
      });

      socket.on('ice-candidate', async ({ candidate }) => {
        if (peerConnectionRef.current) {
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error("Error adding received ice candidate", e);
          }
        }
      });

      socket.on('call-rejected', () => {
        cleanupCall();
        alert("Call rejected");
      });

      socket.on('call-ended', () => {
        cleanupCall();
      });

      socket.on('relationshipUpdate', ({ targetId, status }) => {
        if (selectedUserRef.current?.id === targetId) {
          setRelationshipStatus(status);
        }
        if (profileUserRef.current?.id === targetId) {
          setRelationshipStatus(status);
        }
        // If unblocked, refresh users list to show them in search again
        if (status !== 'blocked') {
          fetchUsers();
          fetchFollowRequests();
          fetchBlockedUsers();
        } else {
          fetchBlockedUsers();
        }
      });

      fetchUsers();
      fetchStories();
      fetchNotifications();
      fetchFriendRequests();
      fetchActiveChats();
      fetchFollowRequests();
      fetchBlockedUsers();
      fetchPosts();

      return () => {
        socket.disconnect();
      };
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      const activeProfileId = profileUser?.id || currentUser.id;
      fetchSocialCounts(activeProfileId);
      if (activeTab === 'home') fetchPosts();
      if (activeTab === 'profile') {
        fetchUserPosts(activeProfileId);
        fetchRelationshipStatus(activeProfileId);
      }
    }
  }, [currentUser, activeTab, profileUser]);

  useEffect(() => {
    if (selectedUser && currentUser) {
      fetchMessages();
      fetchStreak();
      fetchRelationshipStatus(selectedUser.id);
      setIsTyping(null);
    }
  }, [selectedUser, currentUser]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // --- WebRTC Call Logic ---
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  const startCallTimer = () => {
    setCallTimer(0);
    timerIntervalRef.current = setInterval(() => {
      setCallTimer(prev => prev + 1);
    }, 1000);
  };

  const stopCallTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const applyAudioOutput = async (useSpeaker: boolean) => {
    if (!remoteAudioRef.current) {
      console.log("[Audio Routing] No remote audio ref found to route output.");
      return;
    }
    const audioEl = remoteAudioRef.current;
    
    if (typeof (audioEl as any).setSinkId !== 'function') {
      console.warn("[Audio Routing] setSinkId is not supported in this browser environment.");
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
      
      console.log("[Audio Routing] Available outputs:", audioOutputs.map(d => ({ id: d.deviceId, label: d.label })));

      if (audioOutputs.length === 0) {
        console.log("[Audio Routing] No audio outputs available to configure.");
        return;
      }

      let targetDevice: MediaDeviceInfo | undefined;

      if (useSpeaker) {
        targetDevice = audioOutputs.find(d => 
          d.label.toLowerCase().includes('speaker') || 
          d.label.toLowerCase().includes('loudspeaker') || 
          d.label.toLowerCase().includes('speakerphone') || 
          d.label.toLowerCase().includes('phone')
        );
      } else {
        targetDevice = audioOutputs.find(d => 
          d.label.toLowerCase().includes('earpiece') || 
          d.label.toLowerCase().includes('receiver') || 
          d.label.toLowerCase().includes('earphone') || 
          d.label.toLowerCase().includes('headset') || 
          d.label.toLowerCase().includes('headphone')
        );

        if (!targetDevice) {
          targetDevice = audioOutputs.find(d => 
            !d.label.toLowerCase().includes('speaker') && 
            !d.label.toLowerCase().includes('loudspeaker') && 
            !d.label.toLowerCase().includes('speakerphone')
          );
        }
      }

      if (targetDevice) {
        console.log(`[Audio Routing] Setting audio output device to: ${targetDevice.label} (ID: ${targetDevice.deviceId})`);
        await (audioEl as any).setSinkId(targetDevice.deviceId);
      } else {
        console.log("[Audio Routing] No specific matches, falling back to default.");
        await (audioEl as any).setSinkId('');
      }
    } catch (err) {
      console.error("[Audio Routing] Error setting audio output device:", err);
    }
  };

  useEffect(() => {
    if (callState === 'ongoing' && remoteStream) {
      applyAudioOutput(isSpeakerOn);
    }
  }, [isSpeakerOn, callState, remoteStream]);

  const cleanupCall = () => {
    stopCallTimer();
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setRemoteStream(null);
    setCallState('idle');
    setCallData({});
    setIsMuted(false);
    setIsSpeakerOn(false);
    setIsVideoCall(false);
  };

  const createPeerConnection = (targetUserId: string) => {
    const pc = new RTCPeerConnection(iceServers);
    
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', { to: targetUserId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
        setTimeout(() => {
          applyAudioOutput(isSpeakerOn);
        }, 150);
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  const initiateCall = async (targetUser: User, isVideo: boolean = false) => {
    if (!currentUser) return;
    
    setIsVideoCall(isVideo);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? { width: 640, height: 480 } : false
      });
      localStreamRef.current = stream;
      
      const pc = createPeerConnection(targetUser.id);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current?.emit('call-user', {
        to: targetUser.id,
        from: currentUser.id,
        offer,
        callerName: currentUser.username,
        isVideo
      });

      setCallData({ toId: targetUser.id, callerName: targetUser.username, isVideo });
      setCallState('calling');
    } catch (err) {
      console.error("Failed to start call:", err);
      alert(isVideo ? "Could not access camera & microphone" : "Could not access microphone");
    }
  };

  const answerCall = async () => {
    if (!currentUser || !callData.fromId || !callData.offer) return;

    const isVideo = !!callData.isVideo;
    setIsVideoCall(isVideo);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? { width: 640, height: 480 } : false
      });
      localStreamRef.current = stream;

      const pc = createPeerConnection(callData.fromId);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketRef.current?.emit('answer-call', {
        to: callData.fromId,
        answer
      });

      setCallState('ongoing');
      startCallTimer();
    } catch (err) {
      console.error("Failed to answer call:", err);
      cleanupCall();
    }
  };

  const rejectCall = () => {
    if (callData.fromId) {
      socketRef.current?.emit('reject-call', { to: callData.fromId });
    }
    cleanupCall();
  };

  const endCall = () => {
    const targetId = callData.toId || callData.fromId;
    if (targetId) {
      socketRef.current?.emit('end-call', { to: targetId });
    }
    cleanupCall();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (messages.length > 0) {
      setLastEmotion(messages[messages.length - 1].emotion || 'neutral');
    } else {
      setLastEmotion('neutral');
    }
  }, [messages]);

  const themeConfig = {
    happy: {
      bg: "inline-block w-full h-full bg-gradient-to-br from-yellow-400 via-orange-400 to-amber-500",
      bubble: "bg-amber-100 text-amber-900 border-none shadow-amber-200/50 scale-105",
      userBubble: "bg-orange-500 text-white shadow-orange-500/30",
      animation: { scale: [1, 1.02, 1], transition: { duration: 2, repeat: Infinity } },
      emoji: "😊"
    },
    sad: {
      bg: "inline-block w-full h-full bg-gradient-to-br from-slate-800 via-blue-900 to-slate-900 blur-[2px] transition-all duration-1000",
      bubble: "bg-blue-100/10 backdrop-blur-md text-blue-100 border-blue-500/20 shadow-blue-500/10",
      userBubble: "bg-blue-700/80 text-blue-50 shadow-blue-700/20",
      animation: { opacity: [0.8, 1, 0.8], transition: { duration: 4, repeat: Infinity } },
      emoji: "😢"
    },
    angry: {
      bg: "inline-block w-full h-full bg-gradient-to-br from-red-950 via-black to-slate-950",
      bubble: "bg-red-500/10 border-red-500/30 text-red-200",
      userBubble: "bg-red-600 text-white shadow-red-600/40",
      animation: {},
      emoji: "😠"
    },
    neutral: {
      bg: "inline-block w-full h-full bg-bg-deep",
      bubble: "bg-bg-side border-white/5 text-gray-300",
      userBubble: "bg-indigo-600 text-white shadow-indigo-600/10",
      animation: {},
      emoji: ""
    }
  };

  const getEmotionEmoji = (emotion?: SentimentEmotion) => {
    switch (emotion) {
      case 'happy': return '✨';
      case 'sad': return '💧';
      case 'angry': return '🔥';
      default: return '';
    }
  };

  const fetchPosts = async () => {
    if (!currentUser) return;
    try {
      const res = await api.get(`/api/posts?viewerId=${currentUser.id}`);
      setPosts(res.data);
    } catch (e) {
      console.error("Error fetching posts:", e);
    }
  };

  const handleLike = async (postId: number) => {
    if (!currentUser) return;
    try {
      const res = await api.post(`/api/posts/${postId}/like`, { userId: currentUser.id });
      if (res.status === 200) {
        const { liked } = res.data;
        setPosts(prev => prev.map(post => {
          if (post.id === postId) {
            const newLikes = liked 
              ? [...post.likes, currentUser.id]
              : post.likes.filter(id => id !== currentUser.id);
            return { ...post, likes: newLikes };
          }
          return post;
        }));
      }
    } catch (e) {
      console.error("Error liking post:", e);
    }
  };

  const handleComment = async (postId: number, content: string) => {
    if (!currentUser) return;
    try {
      const res = await api.post(`/api/posts/${postId}/comments`, { userId: currentUser.id, content });
      if (res.status === 200) {
        const newComment = res.data;
        setPosts(prev => prev.map(post => {
          if (post.id === postId) {
            return { ...post, comments: [...post.comments, newComment] };
          }
          return post;
        }));
      }
    } catch (e) {
      console.error("Error creating comment:", e);
    }
  };

  const fetchUserPosts = async (userId: string) => {
    if (!currentUser) return;
    try {
      const res = await api.get(`/api/users/${userId}/posts?viewerId=${currentUser.id}`);
      setUserPosts(res.data);
    } catch (e) {
      console.error("Error fetching user posts:", e);
    }
  };

  const handleProfileClick = async (userId: string) => {
    if (!currentUser) return;
    try {
      const res = await api.get(`/api/users?viewerId=${currentUser.id}`);
      const allUsers = res.data;
      const user = allUsers.find((u: User) => u.id === userId);
      if (user) {
        setProfileUser(user);
        setActiveTab('profile');
        setSelectedPost(null);
        setIsEditingProfile(false);
      }
    } catch (e) {
      console.error("Error fetching user for profile click:", e);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      const res = await api.put(`/api/users/${currentUser.id}`, editForm);
      if (res.status === 200) {
        const updatedUser = { ...currentUser, ...editForm };
        setCurrentUser(updatedUser);
        setProfileUser(updatedUser);
        setIsEditingProfile(false);
        fetchUsers();
      } else {
        alert("Failed to update profile.");
      }
    } catch (e) {
      console.error("Error updating profile:", e);
    }
  };

  const fetchUsers = async () => {
    if (!currentUser) return;
    try {
      const res = await api.get(`/api/users?viewerId=${currentUser.id}`);
      setUsers(res.data.filter((u: User) => u.id !== currentUser?.id));
    } catch (e) {
      console.error("Error fetching users:", e);
    }
  };

  const fetchStories = async () => {
    if (!currentUser) return;
    try {
      const res = await api.get(`/api/stories?viewerId=${currentUser.id}`);
      setStories(res.data);
    } catch (e) {
      console.error("Error fetching stories:", e);
    }
  };

  const fetchSocialCounts = async (userId: string) => {
    try {
      const res = await api.get(`/api/social-counts/${userId}`);
      setSocialCounts(res.data);
    } catch (e) {
      console.error("Error fetching social counts:", e);
    }
  };

  const fetchRelationshipStatus = async (targetId: string) => {
    if (!currentUser) return;
    try {
      const res = await api.get(`/api/relationship-status/${currentUser.id}/${targetId}`);
      setRelationshipStatus(res.data.status);
      setChatRelationshipStatus(res.data.chatStatus || 'none');
    } catch (e) {
      console.error("Error fetching relationship status:", e);
    }
  };

  const fetchNotifications = async () => {
    if (!currentUser) return;
    try {
      const res = await api.get(`/api/notifications/${currentUser.id}`);
      setNotifications(res.data);
    } catch (e) {
      console.error("Error fetching notifications:", e);
    }
  };

  const fetchFriendRequests = async () => {
    if (!currentUser) return;
    try {
      const res = await api.get(`/api/friend-requests/${currentUser.id}`);
      setFriendRequests(res.data);
    } catch (e) {
      console.error("Error fetching friend requests:", e);
    }
  };

  const fetchActiveChats = async () => {
    if (!currentUser) return;
    try {
      const res = await api.get('/api/chats');
      setChatList(res.data);
    } catch (e) {
      console.error("Error fetching active chats", e);
    }
  };

  const fetchFollowRequests = async () => {
    if (!currentUser) return;
    try {
      const res = await api.get(`/api/follow-requests/${currentUser.id}`);
      setFollowRequests(res.data);
    } catch (e) {
      console.error("Error fetching follow requests:", e);
    }
  };

  const fetchBlockedUsers = async () => {
    if (!currentUser) return;
    try {
      const res = await api.get(`/api/blocked-users/${currentUser.id}`);
      setBlockedUsers(res.data);
    } catch (e) {
      console.error("Error fetching blocked users:", e);
    }
  };

  const fetchFollowingUsers = async () => {
    if (!currentUser) return;
    try {
      const res = await api.get(`/api/following/${currentUser.id}`);
      const data = res.data;
      // Add AI Assistant to the list if not present
      const aiAssistant: User = { 
        id: 'ai-assistant', 
        username: 'AI Assistant', 
        email: 'ai@system', 
        avatarColor: '#4f46e5',
        accountType: 'public'
      };
      setFollowingUsers([aiAssistant, ...data]);
    } catch (e) {
      console.error("Error fetching following users:", e);
    }
  };

  const fetchStoryViewers = async (storyId: number) => {
    try {
      const res = await api.get(`/api/stories/${storyId}/viewers`);
      setStoryViewers(res.data);
    } catch (e) {
      console.error("Error fetching story viewers", e);
    }
  };

  const handleBlock = (explicitTargetId?: string) => {
    if (!currentUser) return;
    const targetId = explicitTargetId || profileUser?.id || selectedUser?.id;
    if (!targetId || targetId === currentUser.id) return;
    
    const targetUsername = (explicitTargetId && profileUser?.id === explicitTargetId) 
      ? profileUser.username 
      : (explicitTargetId && selectedUser?.id === explicitTargetId) 
      ? selectedUser.username 
      : profileUser?.id === targetId 
      ? profileUser.username 
      : selectedUser?.id === targetId 
      ? selectedUser.username 
      : "this user";

    setConfirmModal({
      isOpen: true,
      title: `Block ${targetUsername}`,
      message: `Are you sure you want to block ${targetUsername}? They will no longer be able to message you or see your content, and all existing chat history will be permanently deleted.`,
      confirmText: "Block User",
      cancelText: "Cancel",
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await api.post(`/api/block/${targetId}`, { blockerId: currentUser.id });
          if (res.status === 200) {
            await api.delete(`/api/messages/${targetId}`);
            
            if (profileUser?.id === targetId) {
              fetchRelationshipStatus(targetId);
              fetchSocialCounts(targetId);
            }
            if (selectedUser?.id === targetId) {
              setSelectedUser(null);
              setMessages([]);
            }
            fetchBlockedUsers();
            fetchUsers();
            
            if (callState !== 'idle' && (callData.toId === targetId || callData.fromId === targetId)) {
              endCall();
            }
            socketRef.current?.emit('deleteChat', { userId: currentUser.id, otherId: targetId });
          }
        } catch (err) {
          console.error("Failed to block user:", err);
        }
      }
    });
  };

  const handleUnblock = (targetId: string) => {
    if (!currentUser) return;

    setConfirmModal({
      isOpen: true,
      title: "Unblock User",
      message: "Are you sure you want to unblock this user? This will allow you to send messages and follow each other.",
      confirmText: "Unblock",
      cancelText: "Cancel",
      isDanger: false,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await api.post(`/api/unblock/${targetId}`, { blockerId: currentUser.id });
          if (res.status === 200) {
            if (profileUserRef.current?.id === targetId) fetchRelationshipStatus(targetId);
            fetchBlockedUsers();
            fetchUsers();
          }
        } catch (err) {
          console.error("Failed to unblock user:", err);
        }
      }
    });
  };

  const handleFollow = async () => {
    if (!currentUser) return;
    const target = activeTab === 'profile' ? profileUser : (selectedUser || profileUser);
    if (!target) return;

    try {
      const endpoint = relationshipStatus === 'following' ? `/api/unfollow/${target.id}` : `/api/follow/${target.id}`;
      const res = await api.post(endpoint, { followerId: currentUser.id });
      fetchRelationshipStatus(target.id);
      fetchSocialCounts(target.id);
    } catch (e: any) {
      console.error("Error toggling follow status:", e);
      alert(e.response?.data?.error || "Failed to update follow status.");
    }
  };

  const handleFriendRequest = async () => {
    if (!currentUser || !selectedUser) return;
    try {
      await api.post('/api/send-request', { receiverId: selectedUser.id });
      alert("Chat request sent successfully!");
      if (profileUser?.id) {
        fetchRelationshipStatus(profileUser.id);
      }
    } catch (e: any) {
      alert(e.response?.data?.error || "Failed to send chat request");
    }
  };

  const acceptFriendRequest = async (requestId: number) => {
    if (!currentUser) return;
    try {
      await api.post('/api/accept-request', { requestId });
      fetchFriendRequests();
      fetchActiveChats();
    } catch (e: any) {
      alert(e.response?.data?.error || "Failed to accept chat request");
    }
  };

  const rejectFriendRequest = async (requestId: number) => {
    try {
      await api.post('/api/reject-request', { requestId });
      fetchFriendRequests();
    } catch (e: any) {
      alert(e.response?.data?.error || "Failed to reject chat request");
    }
  };

  const markNotificationsRead = async () => {
    if (!currentUser) return;
    await api.post(`/api/notifications/${currentUser.id}/read`);
    setNotifications(prev => prev.map(n => ({ ...n, isRead: 1 })));
  };

  const acceptFollowRequest = async (requestId: number) => {
    if (!currentUser) return;
    await api.post(`/api/follow-request/${requestId}/accept`);
    fetchFollowRequests();
    fetchSocialCounts(currentUser.id);
  };

  const rejectFollowRequest = async (requestId: number) => {
    await api.post(`/api/follow-request/${requestId}/reject`);
    fetchFollowRequests();
  };

  const togglePrivacy = async () => {
    if (!currentUser) return;
    const newType = currentUser.accountType === 'public' ? 'private' : 'public';
    const res = await api.patch(`/api/users/${currentUser.id}/privacy`, { accountType: newType });
    if (res.status === 200) {
      setCurrentUser({ ...currentUser, accountType: newType });
      setProfileUser({ ...profileUser!, accountType: newType });
    }
  };

  const fetchMessages = async () => {
    if (!currentUser || !selectedUser) return;
    const res = await api.get(`/api/messages/${currentUser.id}/${selectedUser.id}`);
    setMessages(res.data);
  };

  const fetchStreak = async () => {
    if (!currentUser || !selectedUser) return;
    const res = await api.get(`/api/streaks/${currentUser.id}/${selectedUser.id}`);
    setStreak(res.data.count || 0);
  };

  useEffect(() => {
    if (showRecipientSelection) {
      fetchFollowingUsers();
    }
  }, [showRecipientSelection]);

  useEffect(() => {
    if (activeStory) {
      fetchStoryViewers(activeStory.id);
    } else {
      setStoryViewers([]);
    }
  }, [activeStory]);

  const markStoryAsSeen = async (storyId: number) => {
    if (!currentUser) return;
    try {
      await api.post(`/api/stories/${storyId}/seen`, { userId: currentUser.id });
      setStories(prev => prev.map(s => {
        if (s.id === storyId) {
          const rawSeenBy = s.seenBy;
          let seenByArr: string[] = [];
          if (Array.isArray(rawSeenBy)) {
            seenByArr = [...rawSeenBy];
          } else if (typeof rawSeenBy === 'string' && rawSeenBy.trim()) {
            try {
              seenByArr = JSON.parse(rawSeenBy);
            } catch (err) {
              seenByArr = [];
            }
          }
          if (!Array.isArray(seenByArr)) {
            seenByArr = [];
          }
          if (!seenByArr.includes(currentUser.id)) {
            seenByArr.push(currentUser.id);
            return { ...s, seenBy: seenByArr };
          }
        }
        return s;
      }));
    } catch (e) { console.error("Error marking story seen", e); }
  };

  const handleDeletePost = async (postId: number) => {
    console.log("Attempting to delete post:", postId);
    // Optimistic update
    const oldPosts = [...posts];
    const oldUserPosts = [...userPosts];
    
    setPosts(prev => prev.filter(p => Number(p.id) !== Number(postId)));
    setUserPosts(prev => prev.filter(p => Number(p.id) !== Number(postId)));

    try {
      const res = await api.delete(`/api/posts/${postId}`);
      if (res.status !== 200) {
        throw new Error(res.data.error || "Backend failed to delete");
      }
      console.log("Post deleted successfully on backend");
    } catch (err: any) { 
      console.error("Delete post error:", err);
      // Revert on failure
      setPosts(oldPosts);
      setUserPosts(oldUserPosts);
      alert("Failed to delete post. Please try again.");
    }
  };

  const handleDeleteStory = async (storyId: number) => {
    if (!window.confirm("Delete this story?")) return;
    
    // Optimistic update
    const oldStories = [...stories];
    setStories(prev => prev.filter(s => Number(s.id) !== Number(storyId)));
    setActiveStory(null);

    try {
      const res = await api.delete(`/api/stories/${storyId}`);
      if (res.status !== 200) {
        throw new Error(res.data.error || "Failed to delete story");
      }
      console.log("Story deleted successfully");
    } catch (err: any) { 
      console.error("Delete story error:", err);
      // Revert on failure
      setStories(oldStories);
      alert(err.message || "Failed to delete story. Please try again.");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifierInput.trim()) return;
    
    try {
      const res = await api.post('/api/login', { 
        identifier: identifierInput,
        password: passwordInput 
      });
      const { user, token } = res.data;
      localStorage.setItem('token', token);
      setCurrentUser(user);
      setProfileUser(user);
      setPasswordInput('');
    } catch (e: any) {
      console.error(e);
      alert(e.response?.data?.error || "Login failed. Check your credentials.");
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim() || !emailInput.trim()) return;
    
    try {
      const res = await api.post('/api/signup', { 
        username: usernameInput, 
        email: emailInput,
        password: passwordInput
      });
      const { user, token } = res.data;
      localStorage.setItem('token', token);
      setSignupSuccess(user);
      setPasswordInput('');
    } catch (e: any) {
      console.error(e);
      alert(e.response?.data?.error || "Signup failed. Email might already be in use.");
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentUser) {
      console.error("Delete account failed: No current user");
      return;
    }
    
    console.log("Attempting to delete account for user:", currentUser.id);

    try {
      const res = await api.delete(`/api/users/${currentUser.id}`);
      
      if (res.status === 200) {
        localStorage.removeItem('token');
        alert("Account terminated successfully.");
        setCurrentUser(null);
        setProfileUser(null);
        setActiveTab('home');
      } else {
        alert(`Failed to terminate account: ${res.data.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      console.error("Account deletion exception:", e);
      alert(e.response?.data?.error || "A connection error occurred. Please try again.");
    }
  };

  const getFriendStatus = (userId: string) => {
    if (friendRequests.some(r => r.senderId === userId)) return 'pending' as const;
    // We could add more checks here if we fetched the full friends list
    return 'none' as const;
  };

  const handleSendMessage = async (e?: React.FormEvent, customContent?: string, snapOverride?: boolean) => {
    e?.preventDefault();
    const finalContent = customContent || messageInput;
    if (!finalContent.trim() || !currentUser || !selectedUser) return;
    if (relationshipStatus === 'blocked') {
      alert("You cannot message this user.");
      return;
    }

    if (!customContent) setMessageInput('');

    const payload: Message = {
      id: Date.now(), // Temporary ID
      senderId: currentUser.id,
      receiverId: selectedUser.id,
      content: finalContent,
      isSnap: snapOverride !== undefined ? snapOverride : isSnapEnabled,
      snapTimer: snapTimer,
      timestamp: new Date().toISOString()
    };

    // Use server-side echo to prevent duplicate IDs/stale timestamps
    socketRef.current?.emit('sendMessage', payload);
  };

  const openSnap = async (msg: Message) => {
    if (msg.openedAt) return;
    
    // Set active snap to show it
    setActiveSnap(msg);
    
    if (msg.senderId !== currentUser?.id) {
      // Mark as opened on backend for the receiver only
      await api.post(`/api/messages/${msg.id}/open`);
      socketRef.current?.emit('messageOpened', { msgId: msg.id, receiverId: msg.senderId });
      
      // UI Logic: auto-hide after timer
      setTimeout(() => {
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, openedAt: new Date().toISOString() } : m));
        setActiveSnap(null);
      }, (msg.snapTimer || 5) * 1000);
    }
  };

  // Camera Logic
  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) {
      alert("Camera access denied");
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(t => t.stop());
    setShowCamera(false);
  };

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context?.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvasRef.current.toDataURL('image/jpeg');
      
      if (cameraMode === 'snap') {
        setCapturedImage(dataUrl);
        setShowRecipientSelection(true);
        // Don't stop camera yet so they can see the background or just freeze it
        // Or stop actually it's fine
        stopCamera();
      } else {
        await api.post('/api/stories', { userId: currentUser?.id, content: dataUrl });
        fetchStories();
        stopCamera();
      }
    }
  };

  const handleSendSnapToRecipients = async () => {
    if (!capturedImage || !currentUser || selectedRecipients.length === 0) return;

    for (const recipientId of selectedRecipients) {
      const payload: Message = {
        id: Date.now() + Math.random(),
        senderId: currentUser.id,
        receiverId: recipientId,
        content: capturedImage,
        isSnap: true,
        snapTimer: snapTimer,
        timestamp: new Date().toISOString()
      };
      socketRef.current?.emit('sendMessage', payload);
    }

    setCapturedImage(null);
    setSelectedRecipients([]);
    setShowRecipientSelection(false);
  };

  const handleTyping = () => {
    if (!currentUser || !selectedUser) return;
    socketRef.current?.emit('typing', {
      senderId: currentUser.id,
      receiverId: selectedUser.id
    });
  };

  const deleteChat = () => {
    if (!currentUser || !selectedUser) return;
    setConfirmModal({
      isOpen: true,
      title: "Delete Chat History",
      message: `Are you sure you want to delete all chat history with ${selectedUser.username}? This action is permanent and cannot be undone on either side.`,
      confirmText: "Delete Permanently",
      cancelText: "Keep Chat",
      isDanger: true,
      onConfirm: async () => {
        const oldMessages = [...messages];
        setMessages([]);
        setConfirmModal(null);
        try {
          await api.delete(`/api/messages/${selectedUser.id}`);
          socketRef.current?.emit('deleteChat', { userId: currentUser.id, otherId: selectedUser.id });
        } catch (err) {
          console.error("Failed to delete chat:", err);
          setMessages(oldMessages);
        }
      }
    });
  };

  const handleDeleteMessage = (msgId: number) => {
    if (!currentUser) return;
    setConfirmModal({
      isOpen: true,
      title: "Delete Message",
      message: "Are you sure you want to delete this message? It will be permanently deleted for all participants.",
      confirmText: "Delete",
      cancelText: "Cancel",
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await api.delete(`/api/messages/item/${msgId}`);
          setMessages(prev => prev.filter(msg => msg.id !== msgId));
        } catch (err: any) {
          console.error("Failed to delete message:", err);
        }
      }
    });
  };

  const filteredUsers = users.filter(u => {
    const isSearchMatched = u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (u.handle && u.handle.toLowerCase().includes(searchQuery.toLowerCase())) ||
                           u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const isBlocked = blockedUsers.some(blocked => blocked.id === u.id);
    return isSearchMatched && !isBlocked;
  });

  const filteredChats = chatList.filter(u => {
    const isSearchMatched = u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (u.handle && u.handle.toLowerCase().includes(searchQuery.toLowerCase())) ||
                           u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const isBlocked = blockedUsers.some(blocked => blocked.id === u.id);
    return isSearchMatched && !isBlocked;
  });

  const getActiveView = () => {
    if (appLoading) return (
      <div className="flex h-full items-center justify-center bg-bg-deep">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full"
        />
      </div>
    );
    switch(activeTab) {
      case 'home':
        return (
          <div className="flex-1 flex flex-col items-center bg-bg-deep overflow-y-auto custom-scroll p-3 md:p-8 pt-6">
            {/* Story Bar */}
            <div className="w-full max-w-lg mb-6 md:mb-8 flex space-x-3 md:space-x-4 overflow-x-auto pb-4 custom-scroll scroll-smooth flex-shrink-0 px-4">
              <div 
                onClick={() => { setCameraMode('story'); startCamera(); }}
                className="flex-shrink-0 flex flex-col items-center space-y-2 cursor-pointer group"
              >
                <div className="w-16 h-16 rounded-full border-2 border-indigo-600 border-dashed flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                  <Camera size={24} />
                </div>
                <span className="text-[10px] font-bold text-gray-500 uppercase">You</span>
              </div>
              {stories.map(story => {
                const rawSeenBy = story.seenBy;
                let seenByArr: string[] = [];
                if (Array.isArray(rawSeenBy)) {
                  seenByArr = rawSeenBy;
                } else if (typeof rawSeenBy === 'string' && rawSeenBy.trim()) {
                  try {
                    seenByArr = JSON.parse(rawSeenBy);
                  } catch (err) {
                    seenByArr = [];
                  }
                }
                if (!Array.isArray(seenByArr)) {
                  seenByArr = [];
                }
                const hasSeen = seenByArr.includes(currentUser?.id || '');
                return (
                  <div 
                    key={story.id} 
                    onClick={() => {
                      setActiveStory(story);
                      markStoryAsSeen(story.id);
                    }}
                    className="flex-shrink-0 flex flex-col items-center space-y-2 cursor-pointer group"
                  >
                    <div 
                      className={cn(
                        "w-16 h-16 rounded-full p-0.5 border-2 transition-all duration-500 group-hover:scale-110 shadow-lg",
                        hasSeen 
                          ? "border-white/10 opacity-50" 
                          : "border-indigo-600 shadow-indigo-600/20"
                      )}
                      style={{ borderColor: !hasSeen ? story.avatarColor : undefined }}
                    >
                      <div 
                        className="w-full h-full rounded-full flex items-center justify-center text-white font-black text-xl overflow-hidden"
                        style={{ backgroundColor: story.avatarColor }}
                      >
                        {getInitials(story.username)}
                      </div>
                    </div>
                    <span className={cn(
                      "text-[10px] font-bold uppercase truncate w-16 text-center",
                      hasSeen ? "text-gray-500" : "text-white"
                    )}>{story.username}</span>
                  </div>
                );
              })}
            </div>

            {/* Feed */}
            <div className="w-full max-w-lg">
              <div className="mb-8 p-6 bg-bg-side rounded-3xl border border-white/5 flex items-center justify-between shadow-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 flex items-center justify-center text-indigo-500">
                    <ImageIcon size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">Share a moment</h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Public photo feed</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsUploadModalOpen(true)}
                  className="p-3 bg-indigo-600 text-white rounded-2xl hover:scale-105 transition-transform shadow-lg shadow-indigo-600/20"
                >
                  <Plus size={24} />
                </button>
              </div>

              {posts.map(post => (
                <PostCard 
                  key={post.id} 
                  post={post} 
                  currentUser={currentUser!} 
                  onLike={handleLike} 
                  onComment={handleComment} 
                  onDelete={handleDeletePost}
                  onProfileClick={handleProfileClick}
                />
              ))}

              {posts.length === 0 && (
                <div className="text-center py-20 opacity-20">
                  <ImageIcon size={48} className="mx-auto mb-4" />
                  <p className="text-xl font-black">No posts yet</p>
                </div>
              )}
            </div>
          </div>
        );
      case 'explore':
        const filteredExploreUsers = users.filter(u => {
          if (currentUser && u.id === currentUser.id) return false;
          const isSearchMatched = u.username.toLowerCase().includes(exploreSearchQuery.toLowerCase()) ||
                                 (u.handle && u.handle.toLowerCase().includes(exploreSearchQuery.toLowerCase())) ||
                                 u.email.toLowerCase().includes(exploreSearchQuery.toLowerCase());
          const isBlocked = blockedUsers.some(blocked => blocked.id === u.id);
          return isSearchMatched && !isBlocked;
        });

        // Sort posts by popularity (likes)
        const trendingPosts = [...posts].sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));

        return (
          <div className="flex-1 p-5 md:p-10 bg-bg-deep overflow-y-auto custom-scroll">
            <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h1 className="text-3xl md:text-4xl font-black text-white mb-1 tracking-tight">Explore</h1>
                <p className="text-[10px] md:text-xs text-gray-500 font-bold uppercase tracking-widest">Discover the best of Zintox</p>
              </div>
              <div className="relative w-full md:w-80 group">
                <div className="absolute inset-0 bg-indigo-600/20 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 z-10" />
                <input 
                  type="text" 
                  placeholder="Search voices and vibes..." 
                  value={exploreSearchQuery}
                  onChange={e => setExploreSearchQuery(e.target.value)}
                  className="w-full bg-bg-side border border-white/5 rounded-2xl py-3.5 pl-12 pr-4 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40 shadow-xl transition-all relative z-10"
                />
              </div>
            </header>

            {exploreSearchQuery ? (
              <section className="space-y-4 max-w-2xl mx-auto">
                <h2 className="text-[10px] font-black uppercase tracking-[4px] text-gray-600 mb-6">Matching Creators</h2>
                <div className="flex flex-col gap-3">
                  {filteredExploreUsers.map(user => (
                    <motion.div 
                      key={user.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => {
                        setProfileUser(user);
                        setActiveTab('profile');
                      }}
                      className="bg-bg-side border border-white/5 rounded-2xl p-4 flex items-center justify-between group hover:border-indigo-500/20 transition-all cursor-pointer hover:bg-white/[0.02]"
                    >
                      <div className="flex items-center gap-4">
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-black shadow-lg"
                          style={{ backgroundColor: user.avatarColor }}
                        >
                          {getInitials(user.username)}
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white group-hover:text-indigo-400 transition-colors">{user.username}</h3>
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">{user.email}</p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-gray-600 group-hover:text-indigo-500 transition-colors" />
                    </motion.div>
                  ))}
                  {filteredExploreUsers.length === 0 && (
                    <div className="text-center py-20 opacity-20">
                      <p className="text-xl font-black">No matches found</p>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <section className="max-w-xl mx-auto">
                <h2 className="text-[10px] font-black uppercase tracking-[4px] text-gray-600 mb-8">Trending Now</h2>
                <div className="space-y-8">
                  {trendingPosts.map(post => (
                    <PostCard 
                      key={post.id} 
                      post={post} 
                      currentUser={currentUser!} 
                      onLike={handleLike} 
                      onComment={handleComment} 
                      onDelete={handleDeletePost}
                      onProfileClick={handleProfileClick}
                    />
                  ))}
                  {trendingPosts.length === 0 && (
                    <div className="text-center py-20 opacity-20">
                      <ImageIcon size={48} className="mx-auto mb-4" />
                      <p className="text-xl font-black">No trending content</p>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        );
      case 'snap':
        return (
          <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 bg-bg-deep text-center">
            <div 
              onClick={() => { setCameraMode('snap'); startCamera(); }}
              className="w-32 h-32 bg-indigo-600 rounded-[40px] flex items-center justify-center text-white shadow-3xl shadow-indigo-600/40 cursor-pointer animate-pulse hover:scale-110 transition-transform"
            >
              <Camera size={48} />
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-white mt-8">Quick Snap</h2>
            <p className="text-sm text-gray-500 mt-2">Send a disappearing moment to someone special.</p>
          </div>
        );
      case 'profile':
        if (!profileUser) return null;
        const isOwnProfile = profileUser.id === currentUser?.id;

        return (
          <main className="flex-1 flex flex-col bg-bg-deep p-4 md:p-10 overflow-y-auto custom-scroll">
            <div className="max-w-4xl mx-auto w-full">
              <header className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
                <div className="flex items-center gap-4">
                  {!isOwnProfile && (
                    <button 
                      onClick={() => {
                        setProfileUser(currentUser);
                        setActiveTab('explore');
                      }}
                      className="p-2 md:p-3 bg-white/5 rounded-xl text-gray-400 hover:text-white transition-all active:scale-90"
                    >
                      <ChevronLeft size={20} />
                    </button>
                  )}
                    <div>
                      <h1 className="text-xl md:text-3xl font-black text-white mb-0.5 tracking-tight">
                        {isOwnProfile ? "Your Profile" : `${profileUser.username}'s Profile`}
                      </h1>
                      <p className="text-[10px] md:text-xs text-gray-500 font-bold uppercase tracking-widest">
                        {isOwnProfile ? "Account Dashboard" : "Snapshot Connect"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {isOwnProfile && (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setEditForm({ 
                                username: profileUser.username, 
                                email: (profileUser as any).email || '', 
                                avatarColor: profileUser.avatarColor 
                              });
                              setIsEditingProfile(true);
                            }}
                            className="p-2.5 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-all text-white/50 hover:text-white"
                          >
                            <UserIcon size={18} />
                          </button>
                          <button 
                            onClick={() => setProfileTheme(prev => prev === 'normal' ? 'glass' : 'normal')}
                            className="p-2.5 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-all text-white/50 hover:text-white"
                          >
                            <Palette size={18} />
                          </button>
                        </div>
                      )}
                      {!isOwnProfile && (
                        <button 
                          onClick={() => {
                            setProfileUser(currentUser);
                            setActiveTab('explore');
                          }}
                          className="p-2.5 bg-white/5 rounded-xl text-gray-400 hover:text-white transition-all active:scale-90"
                        >
                          <X size={20} />
                        </button>
                      )}
                    </div>
                      {isOwnProfile && (
                        <button 
                          onClick={() => {
                            localStorage.removeItem('token');
                            setCurrentUser(null);
                            setProfileUser(null);
                            setSelectedUser(null);
                            setActiveTab('home');
                            if (socketRef.current) socketRef.current.disconnect();
                          }}
                          className="px-4 py-2.5 bg-red-500/10 border border-red-500/10 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                        >
                          Sign Out
                        </button>
                      )}
                  </div>
                </header>

                <div className={cn(
                  "rounded-[2.5rem] p-6 md:p-10 mb-8 transition-all overflow-hidden relative",
                  profileTheme === 'normal' 
                    ? "bg-white text-gray-900 shadow-xl border border-gray-100" 
                    : "bg-bg-side border border-white/5 text-white shadow-2xl shadow-indigo-500/5"
                )}>
                  {profileTheme === 'glass' && (
                    <>
                      <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-600/20 rounded-full blur-[100px]" />
                      <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-fuchsia-600/20 rounded-full blur-[100px]" />
                    </>
                  )}

                  {isEditingProfile ? (
                    <form onSubmit={handleUpdateProfile} className="space-y-8 relative z-10">
                      <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <label className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500">Username</label>
                          <input 
                            value={editForm.username}
                            onChange={e => setEditForm({ ...editForm, username: e.target.value })}
                            className={cn(
                              "w-full rounded-2xl p-5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all",
                              profileTheme === 'normal' ? "bg-gray-50 border border-gray-200 text-gray-900" : "bg-white/5 border border-white/10 text-white"
                            )}
                            required
                          />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500">Email Address</label>
                          <input 
                            value={editForm.email}
                            onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                            className={cn(
                              "w-full rounded-2xl p-5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all",
                              profileTheme === 'normal' ? "bg-gray-50 border border-gray-200 text-gray-900" : "bg-white/5 border border-white/10 text-white"
                            )}
                            type="email"
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500">Choose Your Vibe (Avatar Color)</label>
                        <div className="flex flex-wrap gap-4">
                          {['#4f46e5', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#000000', '#7c3aed'].map(color => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setEditForm({ ...editForm, avatarColor: color })}
                              className={cn(
                                "w-12 h-12 rounded-[18px] transition-all border-4",
                                editForm.avatarColor === color 
                                  ? (profileTheme === 'normal' ? "border-gray-900 scale-110 shadow-xl" : "border-white scale-110 shadow-xl shadow-white/10") 
                                  : "border-transparent"
                              )}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-100/10">
                        <button type="submit" className="flex-1 bg-indigo-600 text-white rounded-2xl py-5 font-black uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 active:scale-95">Save Changes</button>
                        <button type="button" onClick={() => setIsEditingProfile(false)} className={cn(
                          "px-10 rounded-2xl py-5 font-black uppercase tracking-[0.2em] transition-all active:scale-95",
                          profileTheme === 'normal' ? "bg-gray-100 text-gray-600 hover:bg-gray-200" : "bg-white/5 text-white/50 hover:text-white"
                        )}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <div className="relative z-10">
                      <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8 mb-8 md:mb-10">
                        <div 
                          className={cn(
                            "w-20 h-20 md:w-28 md:h-28 rounded-2xl md:rounded-3xl flex items-center justify-center text-3xl md:text-4xl text-white font-black shadow-xl relative group overflow-hidden transition-all hover:scale-105",
                            profileTheme === 'normal' ? "ring-4 ring-gray-50" : "ring-4 ring-white/5"
                          )}
                          style={{ backgroundColor: profileUser.avatarColor }}
                        >
                          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <span className="drop-shadow-lg">{getInitials(profileUser.username)}</span>
                        </div>
                        <div className="flex-1 text-center md:text-left">
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 mb-1 md:mb-2">
                            <h2 className={cn("text-xl md:text-3xl font-black tracking-tight", profileTheme === 'normal' ? "text-gray-900" : "text-white")}>
                              {profileUser.username}
                            </h2>
                            {profileUser.accountType === 'public' && (
                              <div className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-2 py-0.5 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest self-center md:self-auto shadow-md">
                                <CheckCircle2 size={8} />
                                Verified
                              </div>
                            )}
                          </div>
                          <p className={cn(
                            "text-xs md:text-sm font-bold mb-4 md:mb-6 uppercase tracking-[0.2em]",
                            profileTheme === 'normal' ? "text-indigo-600" : "text-indigo-400"
                          )}>
                            {profileUser.handle || `@${profileUser.username.toLowerCase().replace(/\s/g, '')}`}
                          </p>
                          
                          <div className="flex flex-wrap justify-center md:justify-start gap-4 md:gap-8">
                            <div className="text-center md:text-left">
                              <p className="text-lg md:text-xl font-black">{socialCounts.followers}</p>
                              <p className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-gray-400">Followers</p>
                            </div>
                            <div className="w-px h-6 bg-gray-200/50 hidden md:block" />
                            <div className="text-center md:text-left">
                              <p className="text-lg md:text-xl font-black">{socialCounts.following}</p>
                              <p className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-gray-400">Following</p>
                            </div>
                            <div className="w-px h-6 bg-gray-200/50 hidden md:block" />
                            <div className="text-center md:text-left">
                              <p className="text-lg md:text-xl font-black">{userPosts.length}</p>
                              <p className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-gray-400">Posts</p>
                            </div>
                          </div>

                          {!isOwnProfile && (
                            <div className="flex flex-wrap gap-3 mt-6 justify-center md:justify-start">
                              <FollowButton status={relationshipStatus} onToggle={handleFollow} />
                              <FriendRequestButton 
                                status={
                                  chatRelationshipStatus === 'friends' 
                                    ? 'friends' 
                                    : (chatRelationshipStatus === 'pending_sent' || chatRelationshipStatus === 'pending_received') 
                                    ? 'pending' 
                                    : 'none'
                                } 
                                onAction={async () => {
                                  try {
                                    await api.post('/api/send-request', { receiverId: profileUser.id });
                                    alert("Chat request sent successfully!");
                                    fetchRelationshipStatus(profileUser.id);
                                  } catch (e: any) {
                                    alert(e.response?.data?.error || "Failed to send chat request");
                                  }
                                }} 
                              />
                              <button
                                onClick={() => handleBlock(profileUser.id)}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-red-600/10 text-red-500 hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
                                title="Block User"
                              >
                                <UserX size={14} />
                                <span>Block</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3 md:gap-4">
                        <div className={cn(
                          "p-4 md:p-5 rounded-2xl md:rounded-[1.5rem] border flex items-center gap-4 transition-all",
                          profileTheme === 'normal' ? "bg-gray-50/50 border-gray-100" : "bg-white/5 border-white/5"
                        )}>
                          <div className={cn(
                            "w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center shadow-sm shrink-0",
                            profileTheme === 'normal' ? "bg-white text-indigo-600 border border-gray-100" : "bg-indigo-600 text-white"
                          )}>
                            <Mail size={16} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Email Connection</p>
                            <p className={cn("text-sm md:text-base font-bold truncate", profileTheme === 'normal' ? "text-gray-900" : "text-white")}>
                              {(profileUser as any).email}
                            </p>
                          </div>
                        </div>

                        <div className={cn(
                          "p-4 md:p-5 rounded-2xl md:rounded-[1.5rem] border flex items-center gap-4 transition-all",
                          profileTheme === 'normal' ? "bg-gray-50/50 border-gray-100" : "bg-white/5 border-white/5"
                        )}>
                          <div className={cn(
                            "w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center shadow-sm shrink-0",
                            profileTheme === 'normal' ? "bg-white text-indigo-600 border border-gray-100" : "bg-indigo-600 text-white"
                          )}>
                            <Lock size={16} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Privacy Level</p>
                            <p className={cn("text-sm md:text-base font-bold uppercase tracking-widest truncate", profileTheme === 'normal' ? "text-gray-900" : "text-white")}>
                              {profileUser.accountType}
                            </p>
                          </div>
                        </div>
                      </div>

                      {isOwnProfile && (
                        <div className="mt-8 md:mt-12 pt-8 md:pt-12 border-t border-gray-100/10 flex flex-col sm:flex-row justify-between items-center gap-6">
                          <div className="space-y-1 text-center sm:text-left">
                            <p className="text-[10px] md:text-xs font-black text-red-500 uppercase tracking-[0.2em] md:tracking-[0.3em]">Identity Termination</p>
                            <p className={cn("text-[9px] md:text-[11px] font-medium leading-relaxed max-w-xs", profileTheme === 'normal' ? "text-gray-500" : "text-white/50")}>
                              Removing your account will permanently wipe your data from the system.
                            </p>
                          </div>
                          <button 
                            onClick={handleDeleteAccount}
                            className="w-full sm:w-auto px-6 md:px-8 py-2 md:py-3 bg-red-500/10 border border-red-500/10 text-red-500 text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-[1.25rem] hover:bg-red-500 hover:text-white transition-all active:scale-95"
                          >
                            Terminate Account
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="col-span-1 md:col-span-3 space-y-12">
                  {isOwnProfile && (followRequests.length > 0 || friendRequests.length > 0) && (
                    <div className="bg-bg-side border border-white/10 border-dashed rounded-3xl p-6 md:p-8">
                       <h3 className="text-[11px] font-black text-indigo-500 uppercase tracking-[4px] mb-6">Pending Requests</h3>
                       <div className="space-y-4">
                         {followRequests.map(req => (
                           <div key={req.id} className="p-4 bg-white/5 rounded-2xl flex items-center justify-between border border-white/5 hover:border-indigo-500/20 transition-all">
                             <div className="flex items-center gap-4">
                               <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: req.avatarColor }}>
                                 {getInitials(req.username)}
                               </div>
                               <div className="flex-1 min-w-0">
                                 <p className="text-sm font-bold text-white truncate">{req.username}</p>
                                 <p className="text-[10px] text-gray-500 uppercase font-black truncate">Wants to follow you</p>
                               </div>
                             </div>
                             <div className="flex gap-2">
                               <button onClick={() => acceptFollowRequest(req.id)} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500/20 transition-all">
                                 <UserCheck size={20} />
                               </button>
                               <button onClick={() => rejectFollowRequest(req.id)} className="p-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition-all">
                                 <X size={20} />
                               </button>
                             </div>
                           </div>
                         ))}
                         {friendRequests.map(req => (
                           <div key={req.id} className="p-4 bg-white/5 rounded-2xl flex items-center justify-between border border-white/5 hover:border-indigo-500/20 transition-all">
                             <div className="flex items-center gap-4">
                               <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: req.avatarColor }}>
                                 {getInitials(req.username)}
                               </div>
                               <div className="flex-1 min-w-0">
                                 <p className="text-sm font-bold text-white truncate">{req.username}</p>
                                 <p className="text-[10px] text-gray-500 uppercase font-black truncate">Wants to be friends</p>
                               </div>
                             </div>
                             <div className="flex gap-2">
                               <button onClick={() => acceptFriendRequest(req.id)} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500/20 transition-all">
                                 <UserCheck size={20} />
                               </button>
                               <button onClick={() => rejectFriendRequest(req.id)} className="p-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition-all">
                                 <UserX size={20} />
                               </button>
                             </div>
                           </div>
                         ))}
                       </div>
                    </div>
                  )}

                  {/* Private Profile / Blocked Lock */}
                  {!isOwnProfile && (profileUser.accountType === 'private' || relationshipStatus === 'blocked') && relationshipStatus !== 'following' && (
                    <div className="bg-bg-side border border-white/5 rounded-[40px] p-12 text-center shadow-2xl flex flex-col items-center">
                      <div className="w-20 h-20 bg-white/5 rounded-[30px] flex items-center justify-center text-gray-500 mb-6">
                        {relationshipStatus === 'blocked' ? <UserX size={32} /> : <Lock size={32} />}
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">
                        {relationshipStatus === 'blocked' ? "User Not Available" : "This Account is Private"}
                      </h3>
                      <p className="text-sm text-gray-500 max-w-xs mx-auto mb-2">
                        {relationshipStatus === 'blocked' 
                          ? "You have blocked this user or they are no longer available." 
                          : "Follow this account to see their photos and stories."}
                      </p>
                      {relationshipStatus === 'blocked' && blockedUsers.some(b => b.id === profileUser.id) && (
                        <button
                          onClick={() => handleUnblock(profileUser.id)}
                          className="mt-4 px-6 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
                        >
                          Unblock {profileUser.username}
                        </button>
                      )}
                    </div>
                  )}

                  {(isOwnProfile || (profileUser.accountType === 'public' && relationshipStatus !== 'blocked' || relationshipStatus === 'following')) && (
                    <>
                      {/* Interaction Controls */}
                      {isOwnProfile && (
                        <div className="flex items-center gap-2 mb-6">
                          <button 
                            onClick={() => setShowBlockedList(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white/5 text-gray-400 hover:text-white transition-all border border-white/5"
                          >
                            Blocked Users
                          </button>
                          <button 
                            onClick={togglePrivacy}
                            className={cn(
                              "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                              currentUser?.accountType === 'private' 
                                ? "bg-indigo-600/10 text-indigo-400 border border-indigo-400/20" 
                                : "bg-white/5 text-gray-500 border border-white/5"
                            )}
                          >
                            {currentUser?.accountType === 'private' ? "Private Account" : "Public Account"}
                          </button>
                        </div>
                      )}

                      {/* User Posts Grid */}
                      <div className="bg-bg-side border border-white/5 rounded-[2rem] p-6 md:p-8 shadow-xl">
                        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[4px] mb-6 md:mb-8">Social Feed</h3>
                        {userPosts.length === 0 ? (
                          <div className="text-center py-10 opa-20">
                            <ImageIcon size={32} className="mx-auto mb-4 opacity-20" />
                            <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">No posts yet</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-4">
                            {userPosts.map(post => (
                              <div 
                                key={post.id} 
                                className="aspect-square rounded-[1.5rem] overflow-hidden bg-white/5 cursor-pointer hover:opacity-80 transition-opacity border border-white/5"
                                onClick={() => setSelectedPost(post)}
                              >
                                <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
            </div>
          </div>
        </main>
      );
      case 'chat':
        return (
          <div className="flex-1 flex overflow-hidden">
            <nav className={cn(
              "w-full md:w-80 flex-shrink-0 bg-bg-side border-r border-white/5 flex flex-col transition-all",
              selectedUser ? "hidden md:flex" : "flex"
            )}>
              <div className="p-5 md:p-8">
                <div className="flex items-center justify-between mb-6 md:mb-8">
                  <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">Messages</h2>
                  <div className="relative">
                    <button 
                      onClick={() => {
                        setShowNotifications(!showNotifications);
                        if (!showNotifications) markNotificationsRead();
                      }}
                      className="p-2 bg-white/5 rounded-xl text-gray-400 hover:text-indigo-400 transition-all relative"
                    >
                      <Bell size={20} />
                      {notifications.some(n => n.isRead === 0) && (
                        <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-bg-side rounded-full" />
                      )}
                    </button>
                    
                    <AnimatePresence>
                      {showNotifications && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 10 }}
                          className="absolute right-0 mt-3 w-80 bg-bg-side border border-white/10 rounded-2xl shadow-2xl z-[60] overflow-hidden"
                        >
                          <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Notifications</span>
                            <button onClick={() => setShowNotifications(false)} className="text-gray-500 hover:text-white"><X size={14} /></button>
                          </div>
                          <div className="max-h-96 overflow-y-auto custom-scroll p-2">
                            {notifications.length === 0 ? (
                              <div className="py-10 text-center text-[10px] uppercase font-bold text-gray-600">No Notifications</div>
                            ) : (
                              notifications.map(notif => (
                                <div key={notif.id} className="p-3 rounded-xl hover:bg-white/5 transition-all flex items-start gap-3 mb-1">
                                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: notif.fromAvatarColor }}>
                                    {getInitials(notif.fromUsername)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-gray-300">
                                      <span className="font-bold text-white">{notif.fromUsername}</span>
                                      {notif.type === 'follow' && " started following you"}
                                      {notif.type === 'follow_request' && " requested to follow you"}
                                      {notif.type === 'follow_accept' && " accepted your follow request"}
                                      {notif.type === 'friend_request' && " sent you a friend request"}
                                      {notif.type === 'friend_accept' && " accepted your friend request"}
                                    </p>
                                    <span className="text-[9px] text-gray-600 uppercase font-black">{formatTime(notif.timestamp)}</span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <div className="relative mb-6 md:mb-8">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input 
                    type="text" 
                    placeholder="Search chats..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-bg-item border border-white/5 rounded-xl py-3 pl-11 pr-4 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand/40"
                  />
                </div>

                {friendRequests.length > 0 && (
                  <div className="mb-6 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                    <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                      <span>Pending Chat Requests ({friendRequests.length})</span>
                      <span className="w-2 h-2 rounded-full bg-indigo-500 animate-[pulse_1.5s_infinite]" />
                    </h3>
                    <div className="space-y-3 max-h-40 overflow-y-auto custom-scroll pr-1">
                      {friendRequests.map(req => (
                        <div key={req.id} className="flex items-center justify-between p-2.5 bg-bg-item rounded-xl border border-white/5 hover:border-indigo-500/10 transition-all">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div 
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-black"
                              style={{ backgroundColor: req.avatarColor }}
                            >
                              {getInitials(req.username)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white truncate">{req.username}</p>
                              <p className="text-[9px] text-gray-500 truncate font-semibold uppercase tracking-wider">Wants to chat</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button 
                              onClick={() => acceptFriendRequest(req.id)}
                              className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 rounded-lg transition-all active:scale-90"
                              title="Accept"
                            >
                              <UserCheck size={14} />
                            </button>
                            <button 
                              onClick={() => rejectFriendRequest(req.id)}
                              className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 rounded-lg transition-all active:scale-90"
                              title="Decline"
                            >
                              <UserX size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="space-y-2 md:space-y-3 pr-2 custom-scroll h-[calc(100dvh-220px)] md:h-[calc(100vh-320px)] overflow-y-auto">
                  {filteredChats.map(user => (
                    <div
                      key={user.id}
                      onClick={() => setSelectedUser(user)}
                      className={cn(
                        "flex items-center space-x-3 md:space-x-4 p-3 md:p-4 rounded-xl md:rounded-2xl border transition-all cursor-pointer group",
                        selectedUser?.id === user.id 
                          ? "bg-white/5 border-white/10 shadow-lg" 
                          : "border-transparent hover:bg-white/5"
                      )}
                    >
                      <div className="relative">
                        <div 
                          className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-white font-bold shadow-2xl text-xs md:text-base mr-1"
                          style={{ backgroundColor: user.avatarColor + '40', color: user.avatarColor }}
                        >
                          {getInitials(user.username)}
                        </div>
                        {user.status === 'online' && (
                          <div className="absolute -bottom-0.5 -right-0.5 md:-bottom-1 md:-right-1 w-3 h-3 md:w-4 md:h-4 bg-emerald-500 border-2 md:border-[3px] border-bg-side rounded-full" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-0.5">
                          <p className="text-sm font-bold text-white truncate">{user.username}</p>
                          <div className="flex items-center gap-1">
                            <Flame size={12} className={cn("text-gray-600", streak > 0 && "text-orange-500")} />
                            <span className="text-[10px] font-black text-gray-500">{streak}</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-500 truncate font-medium">Tap to open chat</p>
                      </div>
                    </div>
                  ))}
                  {filteredChats.length === 0 && (
                    <div className="text-center py-10 opacity-30 flex flex-col items-center justify-center">
                      <MessageSquare size={32} className="mb-2 text-gray-400" />
                      <p className="text-xs font-bold text-gray-500">No active chats.</p>
                      <button 
                        onClick={() => setActiveTab('explore')}
                        className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all"
                      >
                        Explore & Add Friends
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </nav>

            <main className={cn(
              "flex-1 flex flex-col relative transition-all duration-1000 overflow-hidden",
              selectedUser ? "flex" : "hidden md:flex"
            )}>
              {/* Dynamic Theme Background */}
              <motion.div 
                animate={themeConfig[lastEmotion].animation}
                className={cn("absolute inset-0 z-0 opacity-20 transition-all duration-1000 pointer-events-none", themeConfig[lastEmotion].bg)} 
              />
              
              {selectedUser ? (
                <>
                  <header className="w-full border-b border-white/5 glass-header z-20 relative">
                    {/* Main Row */}
                    <div className="flex items-center justify-between h-16 md:h-20 px-4 md:px-8">
                      <div className="flex items-center space-x-3 md:space-x-4 min-w-0">
                        <button onClick={() => setSelectedUser(null)} className="p-2 -ml-2 text-gray-400 hover:text-white md:hidden animate-fade-in">
                          <ChevronLeft size={24} />
                        </button>
                        <div 
                          className="w-9 h-9 md:w-11 md:h-11 rounded-xl flex items-center justify-center text-white text-xs md:text-sm font-bold shadow-lg flex-shrink-0"
                          style={{ backgroundColor: selectedUser.avatarColor + '40', color: selectedUser.avatarColor }}
                        >
                          {getInitials(selectedUser.username)}
                        </div>
                        <div className="min-w-0">
                          <h1 className="text-sm md:text-base font-black text-white flex items-center gap-1.5 truncate">
                            <span className="truncate">{selectedUser.username}</span>
                            {!socketConnected && (
                              <span className="text-[8px] bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded animate-pulse uppercase tracking-tighter flex-shrink-0">Disconnected</span>
                            )}
                          </h1>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-[10px] md:text-[11px] font-bold uppercase tracking-widest leading-none flex-shrink-0",
                              isTyping === selectedUser.id ? "text-indigo-400 animate-pulse" : "text-emerald-500"
                            )}>
                              {isTyping === selectedUser.id ? "Typing..." : "Online"}
                            </span>
                            {streak > 0 && (
                              <div className="flex items-center gap-1 bg-orange-500/10 px-1.5 py-0.5 rounded-full border border-orange-500/20 flex-shrink-0">
                                <Flame size={10} className="text-orange-500 fill-orange-500" />
                                <span className="text-[9px] font-black text-orange-500">{streak}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Desktop only options list on the right */}
                      <div className="hidden md:flex items-center space-x-2 md:space-x-3 text-gray-400">
                        <FollowButton status={relationshipStatus} onToggle={handleFollow} />
                        
                        <div className="w-px h-6 bg-white/10 mx-2" />

                        <button 
                          onClick={() => selectedUser && initiateCall(selectedUser, false)}
                          className="p-2.5 rounded-xl bg-white/5 text-gray-300 hover:text-emerald-500 hover:bg-emerald-500/10 transition-all transform hover:scale-105"
                          title="Audio Call"
                        >
                          <Phone size={18} />
                        </button>
                        <button 
                          onClick={() => selectedUser && initiateCall(selectedUser, true)}
                          className="p-2.5 rounded-xl bg-white/5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-500/10 transition-all transform hover:scale-105"
                          title="Video Call"
                        >
                          <Video size={18} />
                        </button>
                        <button 
                          onClick={() => handleBlock(selectedUser?.id)}
                          className="p-2.5 rounded-xl bg-white/5 text-gray-300 hover:text-red-500 hover:bg-red-500/10 transition-all transform hover:scale-105"
                          title="Block User"
                        >
                          <UserX size={18} />
                        </button>
                        <button 
                          onClick={deleteChat}
                          className="p-2.5 rounded-xl bg-white/5 text-gray-300 hover:text-red-500 hover:bg-red-500/10 transition-all transform hover:scale-105"
                          title="Delete Chat"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                      {/* Mobile only FollowButton */}
                      <div className="flex md:hidden items-center">
                        <FollowButton status={relationshipStatus} onToggle={handleFollow} />
                      </div>
                    </div>

                    {/* Mobile Secondary Option list (underneath the main row) */}
                    <div className="flex md:hidden items-center justify-around py-2 px-1 border-t border-white/5 bg-white/[0.015]">
                      <button 
                        onClick={() => selectedUser && initiateCall(selectedUser, false)}
                        className="flex flex-col items-center justify-center gap-1 flex-1 py-1 text-gray-400 hover:text-emerald-400 active:scale-95 transition-all text-center"
                      >
                        <Phone size={16} />
                        <span className="text-[8px] font-bold uppercase tracking-wider">Audio Call</span>
                      </button>
                      <button 
                        onClick={() => selectedUser && initiateCall(selectedUser, true)}
                        className="flex flex-col items-center justify-center gap-1 flex-1 py-1 text-gray-400 hover:text-indigo-400 active:scale-95 transition-all text-center"
                      >
                        <Video size={16} />
                        <span className="text-[8px] font-bold uppercase tracking-wider">Video Call</span>
                      </button>
                      <button 
                        onClick={() => handleBlock(selectedUser?.id)}
                        className="flex flex-col items-center justify-center gap-1 flex-1 py-1 text-gray-400 hover:text-red-400 active:scale-95 transition-all text-center"
                      >
                        <UserX size={16} />
                        <span className="text-[8px] font-bold uppercase tracking-wider">Block</span>
                      </button>
                      <button 
                        onClick={deleteChat}
                        className="flex flex-col items-center justify-center gap-1 flex-1 py-1 text-gray-400 hover:text-red-400 active:scale-95 transition-all text-center"
                      >
                        <Trash2 size={16} />
                        <span className="text-[8px] font-bold uppercase tracking-wider">Delete</span>
                      </button>
                    </div>
                  </header>

                  <div className="flex-1 p-4 md:p-8 space-y-6 md:space-y-8 overflow-y-auto custom-scroll z-10 relative">
                    <div className="flex flex-col gap-4 md:gap-6">
                      <AnimatePresence initial={false}>
                        {messages.map((msg) => (
                          <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, scale: 0.98, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            whileHover={{ scale: 1.01 }}
                            className={cn(
                              "flex items-end space-x-2 md:space-x-3 max-w-[90%] md:max-w-[85%]",
                              msg.senderId === currentUser?.id ? "flex-row-reverse space-x-reverse self-end" : "self-start"
                            )}
                          >
                            <div className={cn(
                              "relative group flex items-end gap-2",
                              msg.senderId === currentUser?.id ? "flex-row-reverse" : "flex-row"
                            )}>
                              <div className={cn(
                                "p-3 md:p-4 rounded-2xl md:rounded-3xl shadow-xl transition-all duration-500 leading-relaxed text-sm md:text-[15px]",
                                msg.senderId === currentUser?.id 
                                  ? themeConfig[msg.emotion || 'neutral'].userBubble + " rounded-br-none" 
                                  : themeConfig[msg.emotion || 'neutral'].bubble + " rounded-bl-none",
                                msg.isSnap && !msg.openedAt && "bg-gradient-to-br from-purple-600 to-indigo-600 border-none blur-[0.5px]"
                              )} onClick={() => msg.isSnap && openSnap(msg)}>
                                {msg.isSnap ? (
                                  msg.openedAt ? (
                                    <div className="flex items-center gap-2 text-xs italic opacity-50">
                                      <Eye size={14} /> Snap Viewed
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center justify-center py-4 px-8 min-w-[120px]">
                                      <Camera size={24} className="mb-2" />
                                      <span className="text-xs font-bold uppercase tracking-widest">
                                        {msg.senderId === currentUser?.id ? "Snap Sent" : "Tap to Open"}
                                      </span>
                                      <span className="text-[9px] opacity-70 mt-1 uppercase tracking-tighter">({msg.snapTimer}s)</span>
                                    </div>
                                  )
                                ) : (
                                  msg.content.startsWith('data:image') ? (
                                    <img src={msg.content} alt="snap" className="max-w-full rounded-xl max-h-80 object-cover" />
                                  ) : (
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                  )
                                )}
                                <div className="mt-1.5 text-[9px] font-bold tracking-widest opacity-40 uppercase text-right">
                                  {formatTime(msg.timestamp)}
                                </div>
                              </div>
                              {msg.emotion && msg.emotion !== 'neutral' && (
                                <motion.span 
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="text-sm md:text-base select-none"
                                >
                                  {msg.emotion === 'happy' && '😊'}
                                  {msg.emotion === 'sad' && '😢'}
                                  {msg.emotion === 'angry' && '😠'}
                                </motion.span>
                              )}

                              {msg.senderId === currentUser?.id && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteMessage(msg.id);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-500 hover:text-red-400 rounded-full hover:bg-white/5 transition-all duration-300 self-center shrink-0 cursor-pointer"
                                  title="Delete Message"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      <div ref={scrollRef} />
                    </div>
                  </div>

                  <footer className="p-4 md:p-8 pt-0 z-30 relative">
                    <div className="flex flex-col gap-4">
                      {isSnapEnabled && (
                        <div className="flex items-center justify-between px-4 py-2 bg-indigo-600/10 border border-indigo-600/20 rounded-xl">
                          <div className="flex items-center gap-3">
                            <Flame size={16} className="text-indigo-500" />
                            <span className="text-[10px] font-black uppercase text-indigo-500 tracking-widest">Snap Mode Active</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-500 uppercase">Timer:</span>
                              <select 
                                value={snapTimer} 
                                onChange={e => setSnapTimer(Number(e.target.value))}
                                className="bg-transparent text-[10px] font-black text-indigo-400 outline-none"
                              >
                                {[1,3,5,10].map(s => <option key={s} value={s}>{s}s</option>)}
                              </select>
                            </div>
                            <X size={14} className="text-indigo-400 cursor-pointer" onClick={() => setIsSnapEnabled(false)} />
                          </div>
                        </div>
                      )}
                      
                      <form 
                        onSubmit={handleSendMessage}
                        className={cn(
                          "bg-bg-side border border-white/10 rounded-xl md:rounded-2xl p-1.5 md:p-2.5 flex items-center space-x-2 md:space-x-4 shadow-2xl",
                          (relationshipStatus === 'blocked' || (relationshipStatus !== 'following' && selectedUser.id !== 'ai-assistant')) && "opacity-50 pointer-events-none"
                        )}
                      >
                        <button 
                          type="button" 
                          onClick={() => { setCameraMode('snap'); startCamera(); }}
                          disabled={relationshipStatus === 'blocked' || (relationshipStatus !== 'following' && selectedUser.id !== 'ai-assistant')}
                          className="w-10 h-10 md:w-12 md:h-12 bg-white/5 rounded-lg md:rounded-xl flex items-center justify-center text-gray-400 hover:text-white transition-all"
                        >
                          <Camera size={18} />
                        </button>
                        <input 
                          type="text" 
                          placeholder={
                            relationshipStatus === 'blocked' 
                              ? "User is blocked" 
                              : (relationshipStatus !== 'following' && selectedUser.id !== 'ai-assistant')
                                ? "Follow user to send message"
                                : isSnapEnabled ? "Send as Snap..." : "Message..."
                          }
                          value={messageInput}
                          disabled={relationshipStatus === 'blocked' || (relationshipStatus !== 'following' && selectedUser.id !== 'ai-assistant')}
                          onChange={e => {
                            setMessageInput(e.target.value);
                            handleTyping();
                          }}
                          className="flex-1 bg-transparent border-none text-sm text-gray-200 px-3 md:px-4 py-2 md:py-3 focus:outline-none placeholder-gray-600"
                        />
                        <button 
                          type="button" 
                          onClick={() => setIsSnapEnabled(!isSnapEnabled)}
                          className={cn(
                            "w-10 h-10 md:w-12 md:h-12 transition-all flex items-center justify-center rounded-lg md:rounded-xl",
                            isSnapEnabled ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30" : "bg-white/5 text-gray-600"
                          )}
                        >
                          <RefreshCw size={18} className={cn(isSnapEnabled && "animate-spin-slow")} />
                        </button>
                        <button 
                          type="submit" 
                          disabled={!messageInput.trim() || relationshipStatus === 'blocked' || (relationshipStatus !== 'following' && selectedUser.id !== 'ai-assistant')} 
                          className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-lg md:rounded-xl flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
                        >
                          <Send size={16} />
                        </button>
                      </form>
                    </div>
                  </footer>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center text-center opacity-30 p-8">
                  <MessageSquare size={48} className="mb-4" />
                  <h2 className="text-2xl md:text-3xl font-black">Select a Chat</h2>
                </div>
              )}
            </main>
          </div>
        );
      default:
        return null;
    }
  };

  if (!currentUser) {
    if (signupSuccess) {
      return (
        <div className="flex h-[100dvh] items-center justify-center bg-bg-deep p-4 overflow-hidden">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-[2.5rem] bg-bg-side p-7 md:p-12 shadow-2xl border border-white/5 text-center"
          >
            <div className="mb-8 flex h-20 w-20 mx-auto items-center justify-center rounded-3xl bg-emerald-500 text-white shadow-3xl shadow-emerald-500/30">
              <CheckCircle2 size={36} />
            </div>
            <h1 className="text-3xl font-black text-white mb-2">Welcome to Zintox!</h1>
            <p className="text-gray-400 text-sm mb-8">Your unique Digital ID has been generated.</p>
            
            <div className="bg-bg-item p-6 rounded-[2rem] border border-white/5 mb-8 group relative overflow-hidden">
               <div className="absolute inset-0 bg-indigo-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
               <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-3">Your Digital ID</p>
               <div className="text-xl font-black text-white mb-4 select-all">{signupSuccess.handle}</div>
               <button 
                 onClick={() => {
                   navigator.clipboard.writeText(signupSuccess.handle || '');
                   alert("ID Copied to clipboard!");
                 }}
                 className="flex items-center gap-2 mx-auto px-4 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
               >
                 Copy ID
               </button>
            </div>

            <button
              onClick={() => {
                setCurrentUser(signupSuccess);
                setProfileUser(signupSuccess);
                setSignupSuccess(null);
              }}
              className="w-full rounded-xl bg-white text-indigo-600 py-3.5 md:py-4 font-black uppercase tracking-widest active:scale-[0.98] transition-transform shadow-xl"
            >
              Enter Zintox
            </button>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="flex h-[100dvh] items-center justify-center bg-bg-deep p-4 overflow-hidden">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md rounded-[2.5rem] bg-bg-side p-7 md:p-12 shadow-2xl border border-white/5"
        >
          <div className="mb-8 md:mb-10 flex flex-col items-center">
            <div className="mb-5 flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-3xl bg-indigo-600 text-white shadow-3xl shadow-indigo-500/30">
              <MessageSquare size={32} />
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white mb-1 italic">Zintox</h1>
            <div className="flex bg-bg-item p-1 rounded-xl border border-white/5 mt-4">
              <button 
                onClick={() => { setAuthMode('login'); setPasswordInput(''); }}
                className={cn("px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all", authMode === 'login' ? "bg-indigo-600 text-white shadow-lg" : "text-gray-500")}
              >
                Login
              </button>
              <button 
                onClick={() => { setAuthMode('signup'); setPasswordInput(''); }}
                className={cn("px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all", authMode === 'signup' ? "bg-indigo-600 text-white shadow-lg" : "text-gray-500")}
              >
                Signup
              </button>
            </div>
          </div>
          
          {authMode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-[2px] mb-2 ml-1">Digital ID</label>
                <div className="relative">
                  <UserIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
                  <input
                    type="text"
                    value={identifierInput}
                    onChange={e => setIdentifierInput(e.target.value)}
                    placeholder=""
                    className="w-full rounded-xl bg-bg-item border border-white/5 px-11 py-3.5 text-sm text-white placeholder-gray-600 outline-none transition-all focus:border-indigo-500/40"
                    required
                  />
                </div>
                <p className="text-[9px] text-gray-600 font-bold mt-2 ml-1 uppercase tracking-wider">Example: example@gmail.com</p>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-[2px] mb-2 ml-1">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={e => setPasswordInput(e.target.value)}
                    placeholder="Enter account password"
                    className="w-full rounded-xl bg-bg-item border border-white/5 px-11 py-3.5 text-sm text-white placeholder-gray-600 outline-none transition-all focus:border-indigo-500/40"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-indigo-600 py-3.5 md:py-4 font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-transform"
              >
                Access Account
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-[2px] mb-2 ml-1">Your Name</label>
                <div className="relative">
                  <UserIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={e => setUsernameInput(e.target.value)}
                    placeholder=""
                    className="w-full rounded-xl bg-bg-item border border-white/5 px-11 py-3.5 text-sm text-white placeholder-gray-600 outline-none transition-all focus:border-indigo-500/40"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-[2px] mb-2 ml-1">Email Connection</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
                  <input
                    type="email"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    placeholder=""
                    className="w-full rounded-xl bg-bg-item border border-white/5 px-11 py-3.5 text-sm text-white placeholder-gray-600 outline-none transition-all focus:border-indigo-500/40"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-[2px] mb-2 ml-1">Choose Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={e => setPasswordInput(e.target.value)}
                    placeholder="Create a password"
                    className="w-full rounded-xl bg-bg-item border border-white/5 px-11 py-3.5 text-sm text-white placeholder-gray-600 outline-none transition-all focus:border-indigo-500/40"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-indigo-600 py-3.5 md:py-4 font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-transform"
              >
                Create Digital ID
              </button>
            </form>
          )}
          <p className="mt-8 text-center text-[9px] text-gray-600 font-bold uppercase tracking-[0.2em] leading-relaxed">
            By accessing Zintox, you agree to our <br/>
            <span className="text-gray-500 underline cursor-pointer">Protocol Terms</span> & <span className="text-gray-500 underline cursor-pointer">Privacy Matrix</span>
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-bg-deep font-sans text-gray-200">
      {/* Immersive Modals */}
      <AnimatePresence>
        {selectedPost && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedPost(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-xl z-10"
            >
              <div className="absolute -top-4 -right-4 z-20">
                <button 
                  onClick={() => setSelectedPost(null)}
                  className="p-2 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all border border-white/10"
                >
                  <X size={20} />
                </button>
              </div>
              <PostCard 
                post={selectedPost} 
                currentUser={currentUser!} 
                onLike={handleLike} 
                onComment={handleComment} 
                onDelete={(postId) => {
                  handleDeletePost(postId);
                  setSelectedPost(null);
                }}
                onProfileClick={handleProfileClick}
              />
            </motion.div>
          </div>
        )}

        {activeStory && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-4 md:p-10"
          >
            <div className="relative w-full max-w-sm aspect-[9/16] bg-bg-deep rounded-3xl overflow-hidden shadow-2xl flex flex-col">
              <div className="flex-1 relative">
                <img src={activeStory.content} className="w-full h-full object-cover" alt="story" />
                <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full border-2 border-white flex items-center justify-center font-black text-white" style={{ backgroundColor: activeStory.avatarColor }}>
                        {getInitials(activeStory.username)}
                      </div>
                      <span className="font-bold text-white shadow-sm">{activeStory.username}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      {activeStory.userId === currentUser?.id && (
                        <Trash2 
                          size={20} 
                          className="text-red-500 cursor-pointer hover:scale-110 transition-transform" 
                          onClick={() => handleDeleteStory(activeStory.id)}
                        />
                      )}
                      <X className="text-white cursor-pointer" onClick={() => setActiveStory(null)} />
                    </div>
                  </div>
                </div>
                <motion.div 
                  initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 5, ease: 'linear' }}
                  onAnimationComplete={() => setActiveStory(null)}
                  className="absolute bottom-0 left-0 h-1 bg-indigo-500"
                />
              </div>

              {/* Viewers List - Implemented as requested: track and display views/names */}
              {activeStory.userId === currentUser?.id && (
                <div className="bg-black/90 p-4 pt-6 max-h-[40%] overflow-y-auto custom-scroll border-t border-white/10">
                  <div className="flex items-center gap-3 mb-4">
                    <Eye size={16} className="text-indigo-400" />
                    <span className="text-xs font-black text-white uppercase tracking-widest">
                      {storyViewers.length} {storyViewers.length === 1 ? 'View' : 'Views'}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {storyViewers.length === 0 ? (
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest text-center py-4">No views yet</p>
                    ) : (
                      storyViewers.map(viewer => (
                        <div key={viewer.id} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: viewer.avatarColor }}>
                            {getInitials(viewer.username)}
                          </div>
                          <span className="text-xs font-bold text-gray-200">{viewer.username}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeSnap && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-10"
          >
            <div className="relative w-full max-w-sm aspect-[9/16] bg-bg-deep rounded-[3rem] overflow-hidden shadow-3xl border border-white/5">
              <img src={activeSnap.content} className="w-full h-full object-cover" alt="snap" />
              <div className="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-white shadow-lg" style={{ backgroundColor: '#4f46e5' }}>
                      {getInitials(selectedUser?.username || 'U')}
                    </div>
                    <span className="font-bold text-white tracking-tight">{selectedUser?.username}</span>
                  </div>
                  <X className="text-white/50 hover:text-white cursor-pointer transition-colors" onClick={() => setActiveSnap(null)} />
                </div>
              </div>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full border border-white/10">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80">Snap Viewing</span>
              </div>
            </div>
          </motion.div>
        )}

        {showCamera && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[110] bg-black flex flex-col items-center justify-center"
          >
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            
            <div className="absolute inset-0 flex flex-col justify-between p-10 bg-gradient-to-t from-black/40 via-transparent to-black/40">
              <div className="flex justify-between items-center text-white">
                <X size={32} className="cursor-pointer" onClick={stopCamera} />
                <span className="text-xs font-black uppercase tracking-widest">{cameraMode} mode</span>
              </div>
              
              <div className="flex flex-col items-center gap-8">
                <div 
                  onClick={capturePhoto}
                  className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-all shadow-2xl"
                >
                  <div className="w-14 h-14 bg-white rounded-full" />
                </div>
                <div className="flex gap-6">
                  <span className="text-xs font-black uppercase p-2 border-b-2 text-white border-white">
                    {cameraMode === 'snap' ? 'Snap Mode' : 'Story Mode'}
                  </span>
                  {/* Mode switcher removed to prioritize "chat snap only" but still supports story trigger from story bar */}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRecipientSelection && capturedImage && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center p-4 md:p-10"
          >
            <div className="w-full max-w-md bg-bg-side border border-white/10 rounded-[3rem] overflow-hidden flex flex-col shadow-3xl">
              <div className="p-8 border-b border-white/5 bg-gradient-to-br from-indigo-600/10 to-transparent">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-2xl font-black text-white">Send To</h2>
                  <X className="text-white/50 hover:text-white cursor-pointer" onClick={() => { setShowRecipientSelection(false); setCapturedImage(null); }} />
                </div>
                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[4px]">Select Friends</p>
              </div>
              
              <div className="h-32 bg-black relative">
                <img src={capturedImage} className="w-full h-full object-cover opacity-60" alt="preview" />
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-bg-side to-transparent">
                  <div className="px-4 py-1 bg-white/10 backdrop-blur-md rounded-full border border-white/10">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/80">Snap Preview</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scroll p-6 space-y-3 max-h-[50vh]">
                {followingUsers.length === 0 ? (
                  <p className="text-center text-gray-500 py-10">No users followed. Follow someone to send them snaps!</p>
                ) : (
                  followingUsers.map(user => {
                    const isSelected = selectedRecipients.includes(user.id);
                    return (
                      <div 
                        key={user.id} 
                        onClick={() => {
                          setSelectedRecipients(prev => 
                            isSelected ? prev.filter(id => id !== user.id) : [...prev, user.id]
                          );
                        }}
                        className={cn(
                          "p-4 rounded-2xl flex items-center justify-between cursor-pointer transition-all border",
                          isSelected 
                            ? "bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-500/10" 
                            : "bg-white/5 border-transparent hover:bg-white/10"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div 
                            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-inner"
                            style={{ backgroundColor: user.avatarColor }}
                          >
                            {getInitials(user.username)}
                          </div>
                          <div>
                            <p className="font-bold text-white tracking-tight">{user.username}</p>
                            <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{user.id === 'ai-assistant' ? 'System' : user.accountType}</p>
                          </div>
                        </div>
                        <div className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                          isSelected ? "bg-indigo-600 border-indigo-600" : "border-white/20"
                        )}>
                          {isSelected && <Send size={12} className="text-white" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-8 border-t border-white/5 bg-black/20">
                <button 
                  onClick={handleSendSnapToRecipients}
                  disabled={selectedRecipients.length === 0}
                  className="w-full py-4 bg-indigo-600 text-white font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-3"
                >
                  <Send size={18} />
                  Send {selectedRecipients.length > 0 ? `(${selectedRecipients.length})` : ''}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {showBlockedList && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-bg-side border border-white/10 rounded-[40px] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-white">Blocked Accounts</h2>
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[4px] mt-1">Management</p>
                </div>
                <button 
                  onClick={() => setShowBlockedList(false)}
                  className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center text-gray-400 hover:text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="max-h-[400px] overflow-y-auto p-4 space-y-3">
                {blockedUsers.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center text-gray-600 mx-auto mb-4">
                      <UserX size={32} />
                    </div>
                    <p className="text-sm text-gray-500 font-medium">No blocked accounts</p>
                  </div>
                ) : (
                  blockedUsers.map(user => (
                    <div key={user.id} className="p-4 bg-white/5 rounded-2xl flex items-center justify-between border border-white/5 hover:border-white/10 transition-all">
                      <div className="flex items-center gap-4">
                        <div 
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: user.avatarColor }}
                        >
                          {getInitials(user.username)}
                        </div>
                        <span className="text-sm font-bold text-white">{user.username}</span>
                      </div>
                      <button 
                        onClick={() => handleUnblock(user.id)}
                        className="px-4 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
                      >
                        Unblock
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <UploadModal 
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        currentUser={currentUser}
        onUploadSuccess={() => {
          fetchPosts();
          if (activeTab === 'profile') fetchUserPosts(currentUser.id);
        }}
      />

      <div className="flex-1 flex overflow-hidden">
        {getActiveView()}
      </div>

      <nav className="h-20 md:h-24 bg-bg-side border-t border-white/5 flex items-center justify-around px-4 md:px-10 shadow-2xl z-50">
        <NavButton active={activeTab === 'home'} icon={<Home size={24} className="md:w-7 md:h-7" />} onClick={() => setActiveTab('home')} label="Home" />
        <NavButton active={activeTab === 'explore'} icon={<Compass size={24} className="md:w-7 md:h-7" />} onClick={() => setActiveTab('explore')} label="Explore" />
        <NavButton active={activeTab === 'snap'} icon={<Camera size={24} className="md:w-7 md:h-7" />} onClick={() => setActiveTab('snap')} label="Snap" />
        <NavButton active={activeTab === 'chat'} icon={<MessageSquare size={24} className="md:w-7 md:h-7" />} onClick={() => setActiveTab('chat')} label="Chat" />
        <button 
          onClick={() => {
            setProfileUser(currentUser);
            setActiveTab('profile');
          }}
          className={cn(
            "flex flex-col items-center gap-1 transition-all p-2 rounded-2xl",
            activeTab === 'profile' && profileUser?.id === currentUser?.id ? "text-indigo-500 scale-105" : "text-gray-500 hover:text-gray-300"
          )}
        >
          <div 
            className={cn("w-7 h-7 md:w-8 md:h-8 rounded-full border-2", activeTab === 'profile' && profileUser?.id === currentUser?.id ? "border-indigo-500" : "border-transparent")}
            style={{ backgroundColor: (currentUser as any).avatarColor }}
          >
            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white">
              {getInitials((currentUser as any).username)}
            </div>
          </div>
          <span className="text-[9px] md:text-[10px] font-black uppercase tracking-tighter">Me</span>
        </button>
      </nav>
      {/* Hidden Audio for Remote Stream */}
      <audio ref={remoteAudioRef} autoPlay />

      {/* Incoming Call Modal */}
      <AnimatePresence>
        {callState === 'incoming' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-24 sm:bottom-8 left-4 right-4 sm:left-auto sm:right-8 z-[100] sm:w-80 bg-bg-side border border-white/10 rounded-[2.5rem] shadow-2xl p-6 overflow-hidden"
          >
            <div className="absolute inset-0 bg-indigo-600/5 animate-pulse" />
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-[2rem] bg-indigo-600/20 flex items-center justify-center text-indigo-400 text-3xl font-black mb-4 ring-4 ring-indigo-600/10 animate-bounce">
                {callData.callerName?.[0]?.toUpperCase()}
              </div>
              <h3 className="text-lg font-black text-white mb-1">{callData.callerName}</h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-6">Incoming Audio Call...</p>
              
              <div className="flex gap-3 w-full">
                <button 
                  onClick={rejectCall}
                  className="flex-1 py-3.5 rounded-2xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all font-black text-[10px] uppercase tracking-widest"
                >
                  Decline
                </button>
                <button 
                  onClick={answerCall}
                  className="flex-1 py-3.5 rounded-2xl bg-emerald-500 text-white hover:bg-emerald-600 transition-all font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20"
                >
                  Accept
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Call UI */}
      <AnimatePresence>
        {['calling', 'ongoing'].includes(callState) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-bg-deep flex items-center justify-center p-6 md:p-10"
          >
            {/* Immersive Full Screen Video Background for Video Calls */}
            {isVideoCall && (
              <div className="absolute inset-0 w-full h-full bg-black z-0">
                {remoteStream ? (
                  <video
                    ref={(el) => {
                      if (el && el.srcObject !== remoteStream) {
                        el.srcObject = remoteStream;
                        console.log("[Video Call] Remote stream active catalogued");
                      }
                    }}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-indigo-400 gap-4 bg-zinc-950">
                    <div className="w-12 h-12 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                    <span className="text-xs font-black uppercase tracking-[0.2em] animate-pulse">Connecting video...</span>
                  </div>
                )}

                {/* Local Camera PIP Overlay */}
                {localStreamRef.current && (
                  <video
                    ref={(el) => {
                      if (el && el.srcObject !== localStreamRef.current) {
                        el.srcObject = localStreamRef.current;
                        console.log("[Video Call] Local stream active catalogued");
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="absolute top-6 right-6 w-24 h-36 md:w-32 md:h-48 object-cover rounded-2xl border-2 border-white/20 shadow-2xl z-20"
                  />
                )}
              </div>
            )}

            {/* Dark vignette to ensure options text / controls are crystal clear and readable when overlaying camera streams */}
            {isVideoCall && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/55 z-10 pointer-events-none" />
            )}
            
            {!isVideoCall && (
              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-950/40 via-transparent to-purple-950/40 pointer-events-none" />
            )}
            
            <div className="relative z-20 w-full max-w-sm flex flex-col items-center text-center">
              {!isVideoCall && (
                <motion.div 
                  animate={{ scale: [1, 1.05, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="w-32 h-32 md:w-40 md:h-40 rounded-[3rem] bg-white/5 border border-white/10 flex items-center justify-center text-white text-5xl md:text-6xl font-black mb-8 shadow-2xl"
                >
                  {callData.callerName?.[0]?.toUpperCase() || selectedUser?.username?.[0]?.toUpperCase()}
                </motion.div>
              )}

              {/* Minimal avatar overlay for video calls before stream starts */}
              {isVideoCall && !remoteStream && (
                <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white text-3xl font-black mb-8 shadow-2xl">
                  {callData.callerName?.[0]?.toUpperCase() || selectedUser?.username?.[0]?.toUpperCase()}
                </div>
              )}
              
              <h2 className="text-3xl md:text-4xl font-black text-white mb-1.5 tracking-tight drop-shadow-xl">
                {callData.callerName || selectedUser?.username}
              </h2>
              
              <div className="flex items-center gap-3 mb-12 relative z-20">
                <span className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-md",
                  callState === 'calling' ? "bg-amber-500/20 text-amber-400 border border-amber-500/25" : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/25"
                )}>
                  {isVideoCall ? "Video Call: " : "Audio Call: "}{callState === 'calling' ? 'Calling...' : formatDuration(callTimer)}
                </span>
                {callState === 'ongoing' && (
                  <div className="flex gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse delay-75" />
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse delay-150" />
                  </div>
                )}
              </div>

              <div className="flex gap-6 md:gap-8 items-center relative z-20">
                <button 
                  onClick={toggleMute}
                  className={cn(
                    "w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all shadow-xl group",
                    isMuted ? "bg-red-500/10 text-red-500" : "bg-white/5 text-white hover:bg-white/10"
                  )}
                >
                  {isMuted ? <X size={24} /> : <Phone size={24} className="rotate-[135deg]" />}
                </button>
                
                <button 
                  onClick={endCall}
                  className="w-20 h-20 md:w-24 md:h-24 rounded-[2.5rem] bg-red-500 text-white flex items-center justify-center shadow-2xl shadow-red-500/30 hover:bg-red-600 hover:scale-105 active:scale-95 transition-all"
                >
                  <Phone size={32} className="rotate-[135deg]" />
                </button>

                <button 
                  onClick={() => setIsSpeakerOn(prev => !prev)}
                  className={cn(
                    "w-14 h-14 md:w-16 md:h-16 rounded-full flex flex-col items-center justify-center transition-all shadow-xl",
                    isSpeakerOn ? "bg-indigo-500 text-white hover:bg-indigo-600 scale-105" : "bg-white/5 text-white hover:bg-white/10"
                  )}
                  title={isSpeakerOn ? "Speaker Mode Active. Click to switch to Earphone" : "Earphone Mode Active. Click to switch to Speaker"}
                >
                  <Volume2 size={22} className={cn("transition-transform", isSpeakerOn ? "scale-105" : "opacity-60")} />
                  <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest mt-0.5 pointer-events-none">
                    {isSpeakerOn ? "Speaker" : "Earphone"}
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmModal && confirmModal.isOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setConfirmModal(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className="relative w-full max-w-sm z-10 bg-bg-side border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-4 animate-bounce">
                <Trash2 size={24} />
              </div>
              <h2 className="text-lg font-black text-white mb-2">{confirmModal.title}</h2>
              <p className="text-sm text-gray-400 mb-6 font-medium leading-relaxed">{confirmModal.message}</p>
              <div className="flex w-full gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 py-3 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all"
                >
                  {confirmModal.cancelText || 'Cancel'}
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className={cn(
                    "flex-1 py-3 font-black text-xs uppercase tracking-wider rounded-2xl transition-all border shadow-lg" ,
                    confirmModal.isDanger 
                      ? "bg-red-500 border-red-500 hover:bg-red-600 text-white shadow-red-500/20" 
                      : "bg-indigo-600 border-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20"
                  )}
                >
                  {confirmModal.confirmText || 'Confirm'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavButton({ active, icon, onClick, label }: { active: boolean, icon: React.ReactNode, onClick: () => void, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 transition-all p-2 rounded-2xl relative",
        active ? "text-indigo-500 scale-110" : "text-gray-500 hover:text-gray-300"
      )}
    >
      {active && (
        <motion.div layoutId="nav-glow" className="absolute inset-0 bg-indigo-500/10 blur-xl rounded-full" />
      )}
      {icon}
      <span className="text-[10px] font-black uppercase tracking-tighter">{label}</span>
    </button>
  );
}
