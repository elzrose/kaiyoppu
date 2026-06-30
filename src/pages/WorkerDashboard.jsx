import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { doc, getDoc, updateDoc, collection, getDocs, addDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';

const WorkerDashboard = () => {
  const { t } = useTranslation();
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef(null);

  const [userData, setUserData] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editPlace, setEditPlace] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Status Toggle State
  const [workerStatus, setWorkerStatus] = useState('Looking for job');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  
  // Mobile Menu State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Hirers Directory State
  const [showHirersModal, setShowHirersModal] = useState(false);
  const [hirers, setHirers] = useState([]);
  const [loadingHirers, setLoadingHirers] = useState(false);
  const [appliedJobs, setAppliedJobs] = useState([]);
  const [blockedHirers, setBlockedHirers] = useState([]);

  // Notifications State
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [notifTab, setNotifTab] = useState('received'); // 'received' | 'sent'
  const [receivedNotifs, setReceivedNotifs] = useState([]);
  const [sentNotifs, setSentNotifs] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  // Work History State
  const [activeTab, setActiveTab] = useState('profile');

  const [workHistory, setWorkHistory] = useState([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);

  // Verification Wizard State
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [verifyStep, setVerifyStep] = useState(1); // 1: Aadhaar & Info, 2: Selfie
  const [aadhaarNo, setAadhaarNo] = useState('');
  const [capturedSelfie, setCapturedSelfie] = useState(null);
  const [aadhaarCardPic, setAadhaarCardPic] = useState(null);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const videoRef = useRef(null);

  const [timeLeftStr, setTimeLeftStr] = useState('');
  const [isDeadlinePassed, setIsDeadlinePassed] = useState(false);

  useEffect(() => {
    if (userData?.verificationStatus === 'reverification_required' && userData?.reverifyDeadline) {
      const updateTime = () => {
        let deadlineTime = 0;
        if (userData.reverifyDeadline.toDate) {
          deadlineTime = userData.reverifyDeadline.toDate().getTime();
        } else if (userData.reverifyDeadline.seconds) {
          deadlineTime = userData.reverifyDeadline.seconds * 1000;
        } else {
          deadlineTime = new Date(userData.reverifyDeadline).getTime();
        }

        const now = new Date().getTime();
        const diff = deadlineTime - now;
        
        if (diff <= 0) {
          setTimeLeftStr('Expired');
          setIsDeadlinePassed(true);
        } else {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setTimeLeftStr(`${hours}h ${minutes}m ${seconds}s`);
          setIsDeadlinePassed(false);
        }
      };
      
      updateTime();
      const interval = setInterval(updateTime, 1000);
      return () => clearInterval(interval);
    }
  }, [userData]);

  const simulateAadhaarCard = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 450;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#f4f6f9';
    ctx.fillRect(0, 0, 450, 280);
    
    ctx.strokeStyle = '#0066cc';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 446, 276);
    
    ctx.fillStyle = '#0055aa';
    ctx.fillRect(4, 4, 442, 40);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("UNIQUE IDENTIFICATION AUTHORITY OF INDIA", 225, 28);
    
    ctx.fillStyle = '#ff6600';
    ctx.beginPath();
    ctx.arc(400, 90, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px "Inter", sans-serif';
    ctx.fillText("AADHAAR", 400, 125);
    
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(20, 60, 25, 25);
    
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(20, 100, 100, 120);
    ctx.fillStyle = '#666666';
    ctx.beginPath();
    ctx.arc(70, 140, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(70, 210, 40, Math.PI, 0);
    ctx.fill();
    
    ctx.fillStyle = '#333333';
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px "Inter", sans-serif';
    ctx.fillText("GOVERNMENT OF INDIA", 140, 75);
    
    ctx.font = '11px "Inter", sans-serif';
    ctx.fillText("Name / பெயர்: " + (editName || "Worker Name"), 140, 110);
    ctx.fillText("DOB / பிறந்த தேதி: " + (editAge ? `Age ${editAge} Yrs` : "N/A"), 140, 130);
    ctx.fillText("Gender / பாலினம்: Male", 140, 150);
    ctx.fillText("Address / முகவரி: " + (editPlace || "N/A"), 140, 170);
    
    ctx.fillStyle = '#cc3300';
    ctx.font = 'bold 18px "Inter", sans-serif';
    ctx.fillText(aadhaarNo ? `${aadhaarNo.slice(0, 4)}  ${aadhaarNo.slice(4, 8)}  ${aadhaarNo.slice(8, 12)}` : "1234  5678  9012", 140, 210);
    
    ctx.fillStyle = '#0055aa';
    ctx.fillRect(4, 250, 442, 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("ஆதார் - சாதாரண மனிதனின் அதிகாரம்", 225, 266);
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setAadhaarCardPic(dataUrl);
  };

  const syncHistoryWithRequests = async () => {
    if (!currentUser?.uid) return;
    try {
      const qFrom = query(
        collection(db, 'requests'),
        where('status', '==', 'accepted'),
        where('fromUid', '==', currentUser.uid)
      );
      const qTo = query(
        collection(db, 'requests'),
        where('status', '==', 'accepted'),
        where('toUid', '==', currentUser.uid)
      );
      const [fromSnap, toSnap] = await Promise.all([getDocs(qFrom), getDocs(qTo)]);
      const acceptedRequests = [
        ...fromSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        ...toSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      ];

      if (acceptedRequests.length === 0) return;

      const historyRef = collection(db, 'users', currentUser.uid, 'workHistory');
      const historySnap = await getDocs(historyRef);
      const currentHistory = historySnap.docs.map(doc => doc.data());

      let historySize = historySnap.size;
      for (const req of acceptedRequests) {
        const isLogged = currentHistory.some(h => 
          h.requestId === req.id || 
          (h.remark && (h.remark.includes(req.fromEmail) || h.remark.includes(req.toEmail)))
        );

        if (!isLogged) {
          historySize += 1;
          const partnerName = req.fromUid === currentUser.uid ? req.toName : req.fromName;
          const partnerEmail = req.fromUid === currentUser.uid ? req.toEmail : req.fromEmail;
          
          let partnerPlace = 'Local Area';
          try {
            const partnerDoc = await getDoc(doc(db, 'users', req.fromUid === currentUser.uid ? req.toUid : req.fromUid));
            if (partnerDoc.exists()) {
              partnerPlace = partnerDoc.data().place || 'Local Area';
            }
          } catch (e) {}

          await addDoc(historyRef, {
            sno: historySize,
            location: partnerPlace,
            role: userData?.role || req.role || 'Worker',
            duration: 'Ongoing',
            amount: 'Negotiable',
            remark: `Hired by ${partnerName} (${partnerEmail})`,
            requestId: req.id,
            timestamp: serverTimestamp()
          });
        }
      }
    } catch (err) {
      console.warn("History sync failed: ", err);
    }
  };

  const fetchMyRequests = async () => {
    if (!currentUser?.uid) return;
    try {
      const qFrom = query(
        collection(db, 'requests'),
        where('fromUid', '==', currentUser.uid)
      );
      const qTo = query(
        collection(db, 'requests'),
        where('toUid', '==', currentUser.uid)
      );
      const [fromSnap, toSnap] = await Promise.all([getDocs(qFrom), getDocs(qTo)]);
      
      const allReqs = [
        ...fromSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        ...toSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      ];
      setMyRequests(allReqs);
      
      const sentApps = allReqs.filter(r => r.fromUid === currentUser.uid && r.type === 'application');
      setSentNotifs(sentApps);
      
      const receivedInvs = allReqs.filter(r => r.toUid === currentUser.uid && r.type === 'invitation');
      setReceivedNotifs(receivedInvs);
    } catch (err) {
      console.warn("Failed to fetch requests: ", err);
    }
  };

  useEffect(() => {
    const fetchUserData = async () => {
      if (currentUser?.uid) {
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            
            // Check 6-month verification expiration (180 days)
            let isVerified = data.isVerified || false;
            let expired = false;
            if (isVerified && data.lastVerifiedAt) {
              const lastVerified = new Date(data.lastVerifiedAt);
              const now = new Date();
              const diffTime = Math.abs(now - lastVerified);
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              if (diffDays > 180) {
                expired = true;
                isVerified = false;
                await updateDoc(userDocRef, { isVerified: false, isExpired: true });
                data.isVerified = false;
                data.isExpired = true;
              }
            }

            setUserData(data);
            setEditName(data.name || currentUser.displayName || '');
            setEditAge(data.age || '');
            setEditPlace(data.place || '');
            setWorkerStatus(data.status || 'Looking for job');
            setIsExpired(expired || data.isExpired || false);
            
            // Synchronize local work history with accepted requests from root collection
            await syncHistoryWithRequests();
            // Fetch requests for tracking applications and invitations
            await fetchMyRequests();
          }
        } catch (error) {
          console.error("Failed to fetch user data", error);
        }
      }
    };
    fetchUserData();
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.uid && canvasRef.current && userData?.isVerified) {
      QRCode.toCanvas(
        canvasRef.current,
        currentUser.uid,
        { width: 180, margin: 1, color: { dark: '#1a1a1a', light: '#ffffff' } },
        function (error) { if (error) console.error(error); }
      );
    }
  }, [currentUser, userData?.isVerified]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error("Failed to log out", error);
    }
  };

  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 320, facingMode: 'user' } });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.setAttribute("muted", "true");
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.setAttribute("webkit-playsinline", "true");
        videoRef.current.play().catch(e => console.warn("Selfie video play failed:", e));
      }
    } catch (err) {
      console.error("Error accessing webcam: ", err);
      setCameraError(t('camera_error_msg') || 'Webcam access denied or unavailable. Please use Simulated/Mock capture.');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 320;
      const ctx = canvas.getContext('2d');
      // Mirror for natural feel
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedSelfie(dataUrl);
      stopCamera();
    }
  };

  const simulateSelfie = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    
    // Gradient
    const gradient = ctx.createLinearGradient(0, 0, 320, 320);
    gradient.addColorStop(0, '#e141ec');
    gradient.addColorStop(1, '#302b63');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 320, 320);
    
    // Head & shoulders
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(160, 120, 50, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(160, 260, 80, Math.PI, 0);
    ctx.fill();
    
    // Eyes
    ctx.fillStyle = '#0f0c29';
    ctx.beginPath();
    ctx.arc(145, 115, 6, 0, Math.PI * 2);
    ctx.arc(175, 115, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Smile
    ctx.strokeStyle = '#0f0c29';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(160, 130, 20, 0, Math.PI);
    ctx.stroke();

    // Text badge overlay
    ctx.fillStyle = '#00e676';
    ctx.font = 'bold 14px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("✓ VERIFIED SELFIE MOCK", 160, 300);
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedSelfie(dataUrl);
    stopCamera();
  };

  const handleCompleteVerification = async () => {
    if (!capturedSelfie) {
      alert(t('please_capture_selfie'));
      return;
    }
    setIsVerifying(true);
    try {
      // 1. Perform CCTNS background check against our fake DB
      let verificationStatus = 'verified';
      let cctnsRemark = 'Cleared by CCTNS';
      let isVerified = true;

      try {
        const cctnsRef = collection(db, 'cctnsDb');
        const cctnsSnap = await getDocs(cctnsRef);
        const cctnsList = cctnsSnap.docs.map(doc => doc.data());

        // Find a match based on Aadhaar Number (exact match) or Name (case-insensitive substring match)
        const match = cctnsList.find(record => 
          (record.aadhaarNumber && record.aadhaarNumber.trim() === aadhaarNo.trim()) ||
          (record.name && record.name.toLowerCase().trim() === editName.toLowerCase().trim())
        );

        if (match) {
          if (match.type === 'wanted') {
            verificationStatus = 'blocked';
            cctnsRemark = match.offense || 'CCTNS Blocked: Wanted criminal';
            isVerified = false; // "blocked no qr"
          } else if (match.type === 'fir') {
            verificationStatus = 'on_review';
            cctnsRemark = match.offense || 'CCTNS Review: FIR pending';
            isVerified = true; // "review as on review and qr yes"
          }
        }
      } catch (checkErr) {
        console.error("CCTNS Verification failed, falling back to verified", checkErr);
      }

      // 2. Save details to Firestore
      const userDocRef = doc(db, 'users', currentUser.uid);
      const isReverifying = userData?.verificationStatus === 'reverification_required' || userData?.verificationStatus === 'pending_admin_reverify';
      let finalVerificationStatus = verificationStatus;
      let finalIsVerified = isVerified;
      let finalCctnsRemark = cctnsRemark;

      if (isReverifying) {
        finalVerificationStatus = 'pending_admin_reverify';
        finalIsVerified = false; // Blocked until admin manual check
        finalCctnsRemark = 'Pending admin manual verification review';
      }

      const verifyData = {
        name: editName,
        age: editAge,
        place: editPlace,
        aadhaarNumber: aadhaarNo,
        aadhaarCardPic: aadhaarCardPic || '',
        profilePic: capturedSelfie,
        isVerified: finalIsVerified,
        isExpired: false,
        lastVerifiedAt: new Date().toISOString(),
        verificationStatus: finalVerificationStatus,
        cctnsRemark: finalCctnsRemark
      };
      await updateDoc(userDocRef, verifyData);
      setUserData(prev => ({ ...prev, ...verifyData }));
      setIsExpired(false);
      setShowVerifyModal(false);
      setVerifyStep(1);
      setAadhaarNo('');
      setCapturedSelfie(null);
      setAadhaarCardPic(null);

      // 3. Show appropriate alert based on the status
      if (isReverifying) {
        alert(t('reverification_submitted_alert'));
      } else if (finalVerificationStatus === 'blocked') {
        alert(t('bg_check_blocked'));
      } else if (finalVerificationStatus === 'on_review') {
        alert(t('bg_check_review'));
      } else {
        alert(t('verification_complete_msg'));
      }
    } catch (error) {
      console.error("Failed to complete verification", error);
      alert(t('verification_error_msg'));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = workerStatus === 'Looking for job' ? 'Currently Hired' : 'Looking for job';
    setIsUpdatingStatus(true);
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, { status: newStatus });
      setWorkerStatus(newStatus);
      setUserData(prev => ({ ...prev, status: newStatus }));
    } catch (error) {
      console.error("Failed to update status", error);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const fetchHirers = async () => {
    setShowHirersModal(true);
    setLoadingHirers(true);
    try {
      await fetchMyRequests();

      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      const hirersList = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.role === 'Hirer' || data.role === 'hirer') {
          hirersList.push({ id: doc.id, ...data });
        }
      });
      setHirers(hirersList);
    } catch (error) {
      console.error("Failed to fetch hirers", error);
    } finally {
      setLoadingHirers(false);
    }
  };

  const handleApply = async (hirer) => {
    try {
      const docRef = await addDoc(collection(db, 'requests'), {
        fromUid: currentUser.uid,
        fromName: userData?.name || currentUser.displayName || 'Worker',
        fromEmail: currentUser.email,
        toUid: hirer.id,
        toName: hirer.name || hirer.displayName || 'Unnamed Hirer',
        toEmail: hirer.email,
        type: 'application',
        status: 'pending',
        timestamp: serverTimestamp()
      });

      const newReq = {
        id: docRef.id,
        fromUid: currentUser.uid,
        fromName: userData?.name || currentUser.displayName || 'Worker',
        fromEmail: currentUser.email,
        toUid: hirer.id,
        toName: hirer.name || hirer.displayName || 'Unnamed Hirer',
        toEmail: hirer.email,
        type: 'application',
        status: 'pending'
      };

      setAppliedJobs(prev => [...prev, hirer.id]);
      setSentNotifs(prev => [...prev, newReq]);
      setMyRequests(prev => [...prev, newReq]);
      alert(t('application_sent_success'));
    } catch (error) {
      console.error("Error applying", error);
      alert(t('failed_send_application'));
    }
  };

  const handleBlock = (hirerId) => {
    const reason = prompt("Please provide a reason for reporting/blocking this Hirer:");
    if (reason) {
      setBlockedHirers(prev => [...prev, hirerId]);
      alert(t('hirer_reported_blocked'));
    }
  };

  const fetchNotifications = async () => {
    setShowNotificationsModal(true);
    setLoadingNotifs(true);
    try {
      await fetchMyRequests();
    } catch (error) {
      console.error("Failed to fetch notifications", error);
    } finally {
      setLoadingNotifs(false);
    }
  };

  const handleUpdateNotifStatus = async (notifId, newStatus) => {
    try {
      const docRef = doc(db, 'requests', notifId);
      await updateDoc(docRef, { status: newStatus });
      setReceivedNotifs(prev => prev.map(n => n.id === notifId ? { ...n, status: newStatus } : n));
      setMyRequests(prev => prev.map(n => n.id === notifId ? { ...n, status: newStatus } : n));

      const n = receivedNotifs.find(x => x.id === notifId);

      // Auto-toggle status to "Currently Hired" if worker accepts a job invitation!
      if (newStatus === 'accepted') {
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          await updateDoc(userDocRef, { status: 'Currently Hired' });
          setWorkerStatus('Currently Hired');
          if (userData) {
            setUserData(prev => ({ ...prev, status: 'Currently Hired' }));
          }
        } catch (statusErr) {
          console.error("Failed to auto-toggle status on accept:", statusErr);
        }
      }

      // Add to work history on acceptance (safe write to own document)
      if (newStatus === 'accepted' && n) {
        let location = 'Local Area';
        try {
          const hirerDocRef = doc(db, 'users', n.fromUid);
          const hirerDoc = await getDoc(hirerDocRef);
          if (hirerDoc.exists()) {
            location = hirerDoc.data().place || 'Local Area';
          }
        } catch (e) {
          console.error("Error getting hirer place:", e);
        }

        const historyRef = collection(db, 'users', currentUser.uid, 'workHistory');
        const historySnap = await getDocs(historyRef);
        const nextSNo = historySnap.size + 1;

        await addDoc(historyRef, {
          sno: nextSNo,
          location: location,
          role: userData?.role || 'Worker',
          duration: 'Ongoing',
          amount: 'Negotiable',
          remark: `Hired by ${n.fromName} (${n.fromEmail})`,
          requestId: notifId,
          timestamp: serverTimestamp()
        });

        // Re-fetch history to update the local states
        const updatedSnap = await getDocs(historyRef);
        setWorkHistory(updatedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    } catch (error) {
      console.error("Error updating status", error);
    }
  };

  const fetchHistory = async () => {
    setActiveTab('history');
    setIsFetchingHistory(true);
    try {
      const historyRef = collection(db, 'users', currentUser.uid, 'workHistory');
      const snapshot = await getDocs(historyRef);
      if (!snapshot.empty) {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort items so that the highest sno (newest) appears first
        items.sort((a, b) => (b.sno || 0) - (a.sno || 0));
        setWorkHistory(items);
      } else {
        setWorkHistory([
          { id: '1', sno: 1, location: 'Bangalore', role: 'Plumbing', duration: '2 Days', amount: '₹1500', remark: 'Excellent work, very professional.' },
          { id: '2', sno: 2, location: 'Kochi', role: 'Electrical', duration: '5 Hours', amount: '₹800', remark: 'Fixed the wiring issue quickly.' }
        ]);
      }
    } catch (error) {
      console.error("Failed to fetch work history", error);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const tabStyle = (tabName, currentTab) => ({
    flex: 1,
    padding: '12px',
    background: currentTab === tabName ? 'rgba(225, 65, 236, 0.2)' : 'transparent',
    border: 'none',
    borderBottom: currentTab === tabName ? '2px solid #e141ec' : '2px solid transparent',
    color: currentTab === tabName ? '#fff' : '#a0a0a0',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'all 0.3s ease',
    fontFamily: '"Advent Pro", sans-serif',
    fontSize: '1.1rem',
    letterSpacing: '1px'
  });

  return (
    <div style={{
      width: '100vw',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      fontFamily: '"Advent Pro", "Inter", sans-serif',
      padding: '100px 2rem 4rem 2rem',
      boxSizing: 'border-box',
      margin: 0,
      position: 'relative',
      overflowX: 'hidden',
      overflowY: 'auto'
    }}>
      <nav className="dashboard-nav">
        {isMobileMenuOpen && (
          <div className="mobile-menu-overlay hide-on-desktop" onClick={() => setIsMobileMenuOpen(false)}></div>
        )}
        <div>
          <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: '700', color: '#fff', letterSpacing: '3px', textShadow: '0 0 10px rgba(225, 65, 236, 0.4)' }}>
            {t('app_name')}
          </h2>
        </div>
        <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          ☰
        </button>

        <div className={`nav-actions ${isMobileMenuOpen ? 'open' : ''}`}>
          <button className="close-menu-btn hide-on-desktop" onClick={() => setIsMobileMenuOpen(false)}>✕</button>
          <LanguageSwitcher />

          <button
            onClick={fetchNotifications}
            className="nav-btn"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(225, 65, 236, 0.5)',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '25px',
              cursor: 'pointer',
              fontFamily: '"Inter", sans-serif',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            🔔 <span className="hide-on-mobile">{t('notifications')}</span>
          </button>

          <button
            onClick={fetchHirers}
            className="nav-btn"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(225, 65, 236, 0.5)',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '25px',
              cursor: 'pointer',
              fontFamily: '"Inter", sans-serif',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            🔍 <span className="hide-on-mobile">{t('look_for_hirers')}</span>
          </button>

          <button
            onClick={() => { setShowProfileModal(true); setActiveTab('profile'); }}
            className="nav-btn"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(225, 65, 236, 0.5)',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '25px',
              cursor: 'pointer',
              fontFamily: '"Inter", sans-serif',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            👤 <span className="hide-on-mobile">{t('account')}</span>
          </button>
        </div>
      </nav>

      <h1 className="dashboard-title" style={{
        fontSize: '3rem', fontWeight: 'bold', marginBottom: '2rem', color: '#e141ec',
        textShadow: '0 0 15px rgba(225, 65, 236, 0.5)', letterSpacing: '2px', textAlign: 'center'
      }}>
        {t('worker_dash')}
      </h1>

      <div style={{
        background: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(16px)',
        borderRadius: '20px', padding: '2.5rem', width: '100%', maxWidth: '420px',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1
      }}>
        {/* Profile Suspension Check */}
        {userData?.status === 'suspended' || userData?.isSuspended ? (
          <div style={{ textAlign: 'center', width: '100%', padding: '20px 0' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '15px' }}>🚫</div>
            <h2 style={{ color: '#ff4c4c', fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '10px' }}>ACCOUNT SUSPENDED</h2>
            <p style={{ color: '#d0d0d0', fontSize: '0.95rem', lineHeight: '1.5' }}>
              Your account has been suspended by the administrators due to profile mismatches or background verification issues. Please contact support.
            </p>
            <button
              onClick={handleLogout}
              style={{
                marginTop: '25px', width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 'bold', color: '#fff',
                backgroundColor: 'transparent', border: '1px solid rgba(255, 76, 76, 0.5)', borderRadius: '10px', cursor: 'pointer'
              }}
            >
              SIGN OUT
            </button>
          </div>
        ) : (
          <>
            {userData?.verificationStatus && (
              <div style={{
                background: 
                  userData.verificationStatus === 'blocked' || (userData.verificationStatus === 'reverification_required' && isDeadlinePassed) ? 'rgba(255, 76, 76, 0.1)' : 
                  userData.verificationStatus === 'on_review' || userData.verificationStatus === 'reverification_required' ? 'rgba(255, 152, 0, 0.1)' : 
                  userData.verificationStatus === 'pending_admin_reverify' ? 'rgba(33, 150, 243, 0.1)' : 'rgba(0, 230, 118, 0.1)',
                border: 
                  userData.verificationStatus === 'blocked' || (userData.verificationStatus === 'reverification_required' && isDeadlinePassed) ? '1px solid rgba(255, 76, 76, 0.4)' : 
                  userData.verificationStatus === 'on_review' || userData.verificationStatus === 'reverification_required' ? '1px solid rgba(255, 152, 0, 0.4)' : 
                  userData.verificationStatus === 'pending_admin_reverify' ? '1px solid rgba(33, 150, 243, 0.4)' : '1px solid rgba(0, 230, 118, 0.4)',
                color: 
                  userData.verificationStatus === 'blocked' || (userData.verificationStatus === 'reverification_required' && isDeadlinePassed) ? '#ff4c4c' : 
                  userData.verificationStatus === 'on_review' || userData.verificationStatus === 'reverification_required' ? '#ff9800' : 
                  userData.verificationStatus === 'pending_admin_reverify' ? '#2196f3' : '#00e676',
                padding: '10px 15px',
                borderRadius: '10px',
                marginBottom: '15px',
                width: '100%',
                boxSizing: 'border-box',
                textAlign: 'center',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                lineHeight: '1.4'
              }}>
                {userData.verificationStatus === 'blocked' && `🚨 CCTNS BLOCKED: ${userData.cctnsRemark || 'Criminal Record Detected'}`}
                {userData.verificationStatus === 'on_review' && `⚠ CCTNS ON REVIEW: ${userData.cctnsRemark || 'Active FIR Pending Review'}`}
                {userData.verificationStatus === 'verified' && `✓ CCTNS VERIFIED: ${userData.cctnsRemark || 'No Criminal Records Found'}`}
                {userData.verificationStatus === 'reverification_required' && (
                  isDeadlinePassed ? 
                    `🚨 VERIFICATION DEADLINE EXPIRED: Your account has been locked. Please contact administration.` : 
                    `⚠️ POOR QUALITY FLAG: Re-verification required. Time remaining: ${timeLeftStr}`
                )}
                {userData.verificationStatus === 'pending_admin_reverify' && `⏳ AWAITING MANUAL REVIEW: Your new verification details are pending Admin approval.`}
              </div>
            )}

            <div style={{ marginBottom: '2rem', textAlign: 'center', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {/* Selfie Profile Picture */}
              <div style={{
                position: 'relative',
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                overflow: 'hidden',
                border: '2.5px solid #e141ec',
                boxShadow: '0 0 15px rgba(225, 65, 236, 0.4)',
                marginBottom: '1rem',
                background: 'rgba(0, 0, 0, 0.3)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                {userData?.profilePic ? (
                  <img src={userData.profilePic} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ fontSize: '2.5rem', color: 'rgba(255, 255, 255, 0.3)' }}>👤</div>
                )}
                {userData?.isVerified && (
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    width: '100%',
                    background: 'rgba(0, 230, 118, 0.85)',
                    color: '#000',
                    fontSize: '0.65rem',
                    fontWeight: 'bold',
                    padding: '2px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    🔒 Locked
                  </div>
                )}
              </div>

              <h2 style={{ fontSize: '1.8rem', margin: '0 0 0.5rem 0', color: '#fff' }}>{userData?.name === 'Guest User' ? t('guest_user') : (userData?.name || currentUser?.displayName || 'Worker')}</h2>
              <p style={{ fontSize: '1.1rem', color: '#d0d0d0', margin: '0 0 8px 0', fontFamily: '"Inter", sans-serif' }}>{currentUser?.email}</p>
              
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', alignItems: 'center' }}>
                {userData?.isVerified ? (
                  <span style={{ background: 'rgba(0, 200, 83, 0.2)', color: '#00e676', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', border: '1px solid rgba(0, 200, 83, 0.4)' }}>{t('verified')}</span>
                ) : (
                  <span style={{ background: 'rgba(255, 152, 0, 0.2)', color: '#ff9800', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', border: '1px solid rgba(255, 152, 0, 0.4)' }}>
                    {isExpired ? t('verification_expired') : t('unverified')}
                  </span>
                )}
              </div>
              <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.9rem', color: '#b0b0b0' }}>{t('status_label')}</span>
                <button
                  onClick={handleToggleStatus}
                  disabled={isUpdatingStatus}
                  style={{
                    background: workerStatus === 'Looking for job' ? 'rgba(0, 230, 118, 0.1)' : 'rgba(255, 152, 0, 0.1)',
                    color: workerStatus === 'Looking for job' ? '#00e676' : '#ff9800',
                    border: `1px solid ${workerStatus === 'Looking for job' ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255, 152, 0, 0.3)'}`,
                    padding: '6px 15px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer'
                  }}
                >
                  {isUpdatingStatus ? t('updating') : workerStatus === 'Looking for job' ? t('status_looking') : t('status_hired')}
                </button>
              </div>
            </div>

            {/* QR Code Canvas or Unlock Section */}
            <div style={{
              position: 'relative', background: 'rgba(255, 255, 255, 0.9)', padding: '1.5rem',
              borderRadius: '16px', marginBottom: '2.5rem', boxShadow: '0 0 20px rgba(225, 65, 236, 0.4)',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
              minWidth: '220px', minHeight: '220px'
            }}>
              {userData?.isVerified ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  <canvas ref={canvasRef} style={{ width: 180, height: 180, borderRadius: '8px' }}></canvas>
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                    <span style={{ color: '#666', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {t('worker_uid')}
                    </span>
                    <span 
                      onClick={() => {
                        navigator.clipboard.writeText(currentUser?.uid);
                        alert(t('uid_copied'));
                      }}
                      style={{ 
                        color: '#e141ec', fontSize: '0.75rem', fontFamily: 'monospace', 
                        cursor: 'pointer', background: 'rgba(225, 65, 236, 0.08)', 
                        padding: '3px 8px', borderRadius: '4px', border: '1px dashed rgba(225, 65, 236, 0.3)',
                        fontWeight: 'bold', wordBreak: 'break-all', textAlign: 'center'
                      }}
                      title="Click to copy UID"
                    >
                      {currentUser?.uid}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ 
                  width: 180, height: 180, display: 'flex', flexDirection: 'column', 
                  alignItems: 'center', justifyContent: 'center', textAlign: 'center', 
                  color: '#0b0b0b', gap: '10px' 
                }}>
                  <span style={{ fontSize: '2rem' }}>🔒</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold', lineHeight: '1.4' }}>
                    {isExpired ? t('verification_expired') : 
                     userData?.verificationStatus === 'reverification_required' ? t('reverification_required') : 
                     userData?.verificationStatus === 'pending_admin_reverify' ? t('pending_manual_review') : 
                     t('qr_code_locked')}
                  </span>
                  <p style={{ fontSize: '0.75rem', color: '#666', margin: 0 }}>
                    {isExpired ? t('expired_warning_desc') : 
                     userData?.verificationStatus === 'reverification_required' ? t('reverify_deadline_desc') : 
                     userData?.verificationStatus === 'pending_admin_reverify' ? t('pending_review_desc') : 
                     t('complete_verification_prompt')}
                  </p>
                </div>
              )}
            </div>

            {/* Verification Button if Unverified or Expired */}
            {!userData?.isVerified && (
              <button
                onClick={() => {
                  if (userData?.verificationStatus === 'pending_admin_reverify') return;
                  if (userData?.verificationStatus === 'reverification_required' && isDeadlinePassed) {
                    alert(t('window_expired_alert'));
                    return;
                  }
                  setShowVerifyModal(true);
                }}
                disabled={
                  userData?.verificationStatus === 'pending_admin_reverify' ||
                  (userData?.verificationStatus === 'reverification_required' && isDeadlinePassed)
                }
                style={{
                  width: '100%', padding: '14px', fontSize: '1.1rem', fontWeight: 'bold', color: '#fff',
                  backgroundColor: 
                    userData?.verificationStatus === 'pending_admin_reverify' ? 'rgba(33, 150, 243, 0.3)' :
                    (userData?.verificationStatus === 'reverification_required' && isDeadlinePassed) ? 'rgba(255, 76, 76, 0.3)' :
                    '#e141ec', 
                  border: 
                    userData?.verificationStatus === 'pending_admin_reverify' ? '1px solid rgba(33, 150, 243, 0.5)' :
                    (userData?.verificationStatus === 'reverification_required' && isDeadlinePassed) ? '1px solid rgba(255, 76, 76, 0.5)' :
                    'none',
                  borderRadius: '10px', 
                  cursor: 
                    (userData?.verificationStatus === 'pending_admin_reverify' || (userData?.verificationStatus === 'reverification_required' && isDeadlinePassed)) 
                      ? 'not-allowed' : 'pointer',
                  marginBottom: '15px', 
                  boxShadow: 
                    (userData?.verificationStatus === 'pending_admin_reverify' || (userData?.verificationStatus === 'reverification_required' && isDeadlinePassed))
                      ? 'none' : '0 0 15px rgba(225, 65, 236, 0.5)', 
                  transition: 'all 0.3s ease'
                }}
              >
                {userData?.verificationStatus === 'pending_admin_reverify' ? t('awaiting_admin_approval') :
                 (userData?.verificationStatus === 'reverification_required' && isDeadlinePassed) ? t('deadline_expired') :
                 userData?.verificationStatus === 'reverification_required' ? t('reverify_now') :
                 isExpired ? t('reverify_profile') : t('verify_to_unlock')}
              </button>
            )}

            <button
              onClick={handleLogout}
              style={{
                width: '100%', padding: '14px', fontSize: '1.1rem', fontWeight: 'bold', color: '#fff',
                backgroundColor: 'transparent', border: '1px solid rgba(225, 65, 236, 0.5)', borderRadius: '10px', cursor: 'pointer'
              }}
            >
              {t('sign_out')}
            </button>
          </>
        )}
      </div>

      {/* Notifications Modal */}
      {showNotificationsModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
          padding: '40px 0', overflowY: 'auto', zIndex: 100
        }}>
          <div className="responsive-modal" style={{ maxWidth: '600px' }}>
            <button onClick={() => setShowNotificationsModal(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', zIndex: 10 }}>✕</button>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', color: '#e141ec', textAlign: 'center', fontFamily: '"Inter", sans-serif' }}>{t('notifications')}</h2>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <button onClick={() => setNotifTab('received')} style={tabStyle('received', notifTab)}>{t('received_invitations')}</button>
              <button onClick={() => setNotifTab('sent')} style={tabStyle('sent', notifTab)}>{t('sent_applications')}</button>
            </div>

            <div style={{ overflowY: 'auto', maxHeight: '400px', paddingRight: '10px', fontFamily: '"Inter", sans-serif' }}>
              {loadingNotifs ? (
                <div style={{ textAlign: 'center', color: '#b0b0b0', padding: '20px' }}>{t('loading')}</div>
              ) : notifTab === 'received' ? (
                receivedNotifs.length === 0 ? <div style={{ textAlign: 'center', color: '#888' }}>{t('no_invitations_received')}</div> : (
                  <div style={{ display: 'grid', gap: '15px' }}>
                    {receivedNotifs.map(n => (
                      <div key={n.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ fontWeight: 'bold', color: '#fff', marginBottom: '5px' }}>{n.fromName} {t('invited_you')}</div>
                        <div style={{ color: '#b0b0b0', fontSize: '0.9rem', marginBottom: '10px' }}>{n.fromEmail}</div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          {n.status === 'pending' ? (
                            <>
                              <button onClick={() => handleUpdateNotifStatus(n.id, 'accepted')} style={{ background: '#00e676', color: '#000', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>{t('accept')}</button>
                              <button onClick={() => handleUpdateNotifStatus(n.id, 'rejected')} style={{ background: 'transparent', color: '#ff4c4c', border: '1px solid #ff4c4c', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}>{t('reject')}</button>
                            </>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              <div style={{ color: n.status === 'accepted' ? '#00e676' : '#ff4c4c', fontWeight: 'bold' }}>
                                {t('status_label')} {n.status === 'accepted' ? t('status_accepted') : n.status === 'rejected' ? t('status_rejected') : t('status_pending')}
                              </div>
                              {n.status === 'accepted' && (
                                <div style={{ color: '#00e676', fontWeight: 'bold' }}>📞 +91 9876543210</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                sentNotifs.length === 0 ? <div style={{ textAlign: 'center', color: '#888' }}>{t('no_applications_sent')}</div> : (
                  <div style={{ display: 'grid', gap: '15px' }}>
                    {sentNotifs.map(n => (
                      <div key={n.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ fontWeight: 'bold', color: '#fff', marginBottom: '5px' }}>{t('applied_to')} {n.toName}</div>
                        <div style={{ color: '#b0b0b0', fontSize: '0.9rem', marginBottom: '10px' }}>{t('status_label')} {n.status === 'accepted' ? t('status_accepted') : n.status === 'rejected' ? t('status_rejected') : t('status_pending')}</div>
                        {n.status === 'accepted' && (
                          <div style={{ color: '#00e676', fontWeight: 'bold' }}>📞 +91 9876543210</div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Account Modal */}
      {showProfileModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
          padding: '40px 0', overflowY: 'auto', zIndex: 100
        }}>
          <div className="responsive-modal" style={{ maxWidth: activeTab === 'history' ? '700px' : '400px' }}>
            <button onClick={() => setShowProfileModal(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', zIndex: 10 }}>✕</button>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <button onClick={() => setActiveTab('profile')} style={tabStyle('profile', activeTab)}>{t('profile')}</button>
              <button onClick={fetchHistory} style={tabStyle('history', activeTab)}>{t('work_history')}</button>
            </div>
            {/* Account Form UI */}
            {activeTab === 'profile' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', fontFamily: '"Inter", sans-serif' }}>
                {userData?.adminRemark && (
                  <div style={{
                    padding: '12px 15px',
                    background: userData.adminRemark.toLowerCase().includes('reject') || userData.adminRemark.toLowerCase().includes('case') || userData.adminRemark.toLowerCase().includes('failed') ? 'rgba(255, 76, 76, 0.1)' : 'rgba(0, 230, 118, 0.1)',
                    border: userData.adminRemark.toLowerCase().includes('reject') || userData.adminRemark.toLowerCase().includes('case') || userData.adminRemark.toLowerCase().includes('failed') ? '1px solid rgba(255, 76, 76, 0.4)' : '1px solid rgba(0, 230, 118, 0.4)',
                    borderRadius: '8px',
                    color: userData.adminRemark.toLowerCase().includes('reject') || userData.adminRemark.toLowerCase().includes('case') || userData.adminRemark.toLowerCase().includes('failed') ? '#ff4c4c' : '#00e676',
                    fontSize: '0.85rem',
                    textAlign: 'left',
                    boxShadow: userData.adminRemark.toLowerCase().includes('reject') || userData.adminRemark.toLowerCase().includes('case') || userData.adminRemark.toLowerCase().includes('failed') ? '0 0 10px rgba(255, 76, 76, 0.2)' : '0 0 10px rgba(0, 230, 118, 0.2)'
                  }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '0.5px' }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                      </svg>
                      {t('official_remark')}
                    </div>
                    <div style={{ lineHeight: '1.4', color: userData.adminRemark.toLowerCase().includes('reject') || userData.adminRemark.toLowerCase().includes('case') || userData.adminRemark.toLowerCase().includes('failed') ? '#ffb3b3' : '#b3ffcc' }}>
                      {userData.adminRemark}
                    </div>
                  </div>
                )}
                {userData?.isVerified ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ textAlign: 'center', margin: '10px 0' }}>
                      <span style={{ background: 'rgba(0, 200, 83, 0.15)', color: '#00e676', border: '1px solid #00e676', padding: '8px 16px', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 'bold' }}>
                        {t('verified')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>{t('full_name')}</span><span>{userData.name}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>{t('age')}</span><span>{userData.age}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>{t('place')}</span><span>{userData.place}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>{t('aadhaar_card_number')}</span><span>{userData.aadhaarNumber ? `xxxx-xxxx-${userData.aadhaarNumber.slice(-4)}` : 'N/A'}</span></div>
                    </div>
                    <p style={{ color: '#a0a0a0', fontSize: '0.8rem', textAlign: 'center', fontStyle: 'italic', margin: '5px 0' }}>
                      {t('locked_profile_pic_msg')}
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <p style={{ color: '#ff9800', fontSize: '0.9rem', textAlign: 'center', margin: '0 0 10px 0' }}>
                      {isExpired ? t('reverification_needed_msg') : t('qr_unverified_msg')}
                    </p>
                    <button 
                      onClick={() => { setShowProfileModal(false); setShowVerifyModal(true); }} 
                      style={{ marginTop: '10px', width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 'bold', color: '#fff', backgroundColor: '#e141ec', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 0 15px rgba(225, 65, 236, 0.4)' }}
                    >
                      {isExpired ? t('perform_reverification') : t('start_verification_wizard')}
                    </button>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'history' && (
              <div className="responsive-table-wrapper">
                {isFetchingHistory ? <div style={{ textAlign: 'center', padding: '20px' }}>{t('loading')}</div> : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
                    <thead><tr style={{ borderBottom: '1px solid rgba(225, 65, 236, 0.4)', color: '#e141ec' }}><th>{t('sno')}</th><th>{t('where')}</th><th>{t('what')}</th><th>{t('duration')}</th><th>{t('amount')}</th><th>{t('remark')}</th></tr></thead>
                    <tbody>
                      {workHistory.map((job, idx) => (
                        <tr key={job.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                          <td style={{ padding: '14px 8px' }}>{job.sno || idx + 1}</td><td style={{ padding: '14px 8px' }}>{job.location}</td><td style={{ padding: '14px 8px' }}>{job.role}</td><td style={{ padding: '14px 8px' }}>{job.duration}</td><td style={{ padding: '14px 8px', color: '#00e676' }}>{job.amount}</td><td style={{ padding: '14px 8px' }}>"{job.remark}"</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hirers Modal */}
      {showHirersModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
          padding: '40px 0', overflowY: 'auto', zIndex: 100
        }}>
          <div className="responsive-modal" style={{ maxWidth: '600px' }}>
            <button onClick={() => setShowHirersModal(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', zIndex: 10 }}>✕</button>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', color: '#e141ec', textAlign: 'center', fontFamily: '"Inter", sans-serif' }}>{t('available_hirers')}</h2>
            
            <div style={{ overflowY: 'auto', maxHeight: '400px', paddingRight: '10px', fontFamily: '"Inter", sans-serif' }}>
              {loadingHirers ? <div style={{ textAlign: 'center', padding: '20px' }}>{t('loading_hirers')}</div> : (
                <div style={{ display: 'grid', gap: '15px' }}>
                  {hirers.filter(h => !blockedHirers.includes(h.id)).map(hirer => (
                    <div key={hirer.id} style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '15px', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{hirer.name || hirer.displayName || 'Unnamed Hirer'}</span>
                        <span style={{ color: '#00e676', fontSize: '0.8rem', background: 'rgba(0, 230, 118, 0.1)', padding: '4px 8px', borderRadius: '10px' }}>{t('active')}</span>
                      </div>
                      <span style={{ color: '#b0b0b0', fontSize: '0.9rem', marginBottom: '5px' }}>✉️ {hirer.email}</span>
                      <span style={{ color: '#b0b0b0', fontSize: '0.9rem', marginBottom: '15px' }}>📍 {hirer.place || t('location_not_specified')}</span>
                      <div style={{ display: 'flex', gap: '10px', marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px' }}>
                        {(() => {
                          const relReq = myRequests.find(n => 
                            (n.fromUid === currentUser.uid && n.toUid === hirer.id) ||
                            (n.fromUid === hirer.id && n.toUid === currentUser.uid)
                          );
                          if (relReq) {
                            if (relReq.status === 'accepted') {
                              return <div style={{ flex: 1, background: 'rgba(0, 230, 118, 0.1)', color: '#00e676', padding: '8px', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold' }}>📞 +91 9876543210</div>;
                            } else if (relReq.status === 'rejected') {
                              return <div style={{ flex: 1, background: 'rgba(255, 76, 76, 0.1)', color: '#ff4c4c', padding: '8px', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold' }}>{t('status_rejected')}</div>;
                            } else {
                              return <div style={{ flex: 1, background: 'rgba(255, 255, 255, 0.1)', color: '#b0b0b0', padding: '8px', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold' }}>{t('status_pending')}</div>;
                            }
                          } else {
                            return <button onClick={() => handleApply(hirer)} style={{ flex: 1, background: '#e141ec', color: '#fff', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>{t('apply_for_work')}</button>;
                          }
                        })()}
                        <button onClick={() => handleBlock(hirer.id)} style={{ background: 'transparent', color: '#ff4c4c', border: '1px solid rgba(255, 76, 76, 0.4)', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer' }}>{t('report')}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Verification Wizard Modal */}
      {showVerifyModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(10, 10, 20, 0.96)',
          display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
          padding: '40px 0', overflowY: 'auto', zIndex: 110
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(48, 43, 99, 0.95) 0%, rgba(36, 36, 62, 0.95) 100%)',
            border: '1px solid rgba(225, 65, 236, 0.4)', borderRadius: '16px', padding: '30px',
            width: '90%', maxWidth: '460px', position: 'relative', boxShadow: '0 0 30px rgba(225, 65, 236, 0.3)'
          }}>
            <button 
              onClick={() => { stopCamera(); setShowVerifyModal(false); setHasConsented(false); setShowTermsModal(false); setVerifyStep(1); setAadhaarNo(''); setCapturedSelfie(null); }} 
              style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', zIndex: 10 }}
            >
              ✕
            </button>
            
            <h2 style={{ fontSize: '1.6rem', marginBottom: '10px', color: '#e141ec', textAlign: 'center', fontWeight: 'bold' }}>
              {t('verify_step_aadhaar')} & {t('verify_step_selfie')}
            </h2>

            {/* Step Indicators */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '25px', padding: '0 10px', position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, zIndex: 2 }}>
                <div style={{
                  width: '30px', height: '30px', borderRadius: '50%', background: verifyStep >= 1 ? '#e141ec' : '#555',
                  color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', fontSize: '0.9rem'
                }}>1</div>
                <span style={{ fontSize: '0.75rem', marginTop: '5px', color: verifyStep >= 1 ? '#fff' : '#888' }}>{t('step_info_aadhaar')}</span>
              </div>
              <div style={{
                position: 'absolute', top: '15px', left: '15%', right: '15%', height: '2px',
                background: verifyStep >= 2 ? '#e141ec' : '#555', zIndex: 1
              }}></div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, zIndex: 2 }}>
                <div style={{
                  width: '30px', height: '30px', borderRadius: '50%', background: verifyStep >= 2 ? '#e141ec' : '#555',
                  color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold', fontSize: '0.9rem'
                }}>2</div>
                <span style={{ fontSize: '0.75rem', marginTop: '5px', color: verifyStep >= 2 ? '#fff' : '#888' }}>{t('step_live_selfie')}</span>
              </div>
            </div>

            {/* Step 1 Content: Information Form */}
            {verifyStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', fontFamily: '"Inter", sans-serif' }}>
                <div style={{ marginBottom: '5px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#ccc', marginBottom: '5px' }}>{t('full_name')}</label>
                  <input 
                    type="text" 
                    value={editName} 
                    onChange={(e) => setEditName(e.target.value)} 
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff', boxSizing: 'border-box' }} 
                  />
                </div>
                <div style={{ marginBottom: '5px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#ccc', marginBottom: '5px' }}>{t('age')}</label>
                  <input 
                    type="number" 
                    value={editAge} 
                    onChange={(e) => setEditAge(e.target.value)} 
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff', boxSizing: 'border-box' }} 
                  />
                </div>
                <div style={{ marginBottom: '5px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#ccc', marginBottom: '5px' }}>{t('place')}</label>
                  <input 
                    type="text" 
                    value={editPlace} 
                    onChange={(e) => setEditPlace(e.target.value)} 
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff', boxSizing: 'border-box' }} 
                  />
                </div>

                
                 
                  
                  
                    <button 
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.75rem', color: '#e141ec', textDecoration: 'underline', cursor: 'pointer', outline: 'none',textalign: 'left' }}
                    >
                      {t('terms_link')}
                    </button>
                  
                

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '20px', marginTop: '10px', background: 'rgba(225, 65, 236, 0.05)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(225, 65, 236, 0.2)' }}>
                  <input 
                    type="checkbox" 
                    id="consent-checkbox" 
                    checked={hasConsented} 
                    onChange={(e) => setHasConsented(e.target.checked)} 
                    style={{ marginTop: '3px', cursor: 'pointer' }}
                  />
                  <label htmlFor="consent-checkbox" style={{ fontSize: '0.75rem', color: '#b0b0b0', lineHeight: '1.4', cursor: 'pointer' }}>
                    {t('consent_checkbox_label')}
                  </label>
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: hasConsented ? '#ccc' : '#666', marginBottom: '5px' }}>{t('aadhaar_card_number')}</label>
                  <input 
                    type="text" 
                    maxLength="12"
                    placeholder={t('aadhaar_placeholder')}
                    value={aadhaarNo} 
                    onChange={(e) => setAadhaarNo(e.target.value.replace(/\D/g, ''))} 
                    disabled={!hasConsented}
                    style={{ 
                      width: '100%', padding: '10px', borderRadius: '8px', 
                      background: hasConsented ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)', 
                      border: hasConsented ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(255, 255, 255, 0.05)', 
                      color: hasConsented ? '#fff' : '#888', 
                      boxSizing: 'border-box', letterSpacing: '1px',
                      cursor: hasConsented ? 'text' : 'not-allowed'
                    }} 
                  />
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: hasConsented ? '#ccc' : '#666', marginBottom: '5px' }}>{t('aadhaar_card_photo')}</label>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setAadhaarCardPic(reader.result);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      disabled={!hasConsented}
                      style={{ display: 'none' }}
                      id="aadhaar-file-input"
                    />
                    <label 
                      htmlFor="aadhaar-file-input"
                      style={{
                        flex: 1, padding: '10px', borderRadius: '8px', 
                        background: hasConsented ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                        border: hasConsented ? '1px dashed rgba(225, 65, 236, 0.4)' : '1px dashed rgba(255, 255, 255, 0.1)', 
                        color: hasConsented ? '#e141ec' : '#666', 
                        textAlign: 'center',
                        cursor: hasConsented ? 'pointer' : 'not-allowed', 
                        fontWeight: 'bold', fontSize: '0.85rem', transition: 'all 0.3s',
                        pointerEvents: hasConsented ? 'auto' : 'none',
                        opacity: hasConsented ? 1 : 0.5
                      }}
                    >
                      📁 {t('upload_photo')}
                    </label>
                    <button
                      type="button"
                      onClick={simulateAadhaarCard}
                      disabled={!hasConsented || !editName || aadhaarNo.length !== 12}
                      style={{
                        padding: '10px 15px', borderRadius: '8px', 
                        background: (hasConsented && editName && aadhaarNo.length === 12) ? 'rgba(225, 65, 236, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                        border: (hasConsented && editName && aadhaarNo.length === 12) ? '1px solid rgba(225, 65, 236, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)', 
                        color: (hasConsented && editName && aadhaarNo.length === 12) ? '#e141ec' : '#666', 
                        fontWeight: 'bold',
                        fontSize: '0.85rem', 
                        cursor: (hasConsented && editName && aadhaarNo.length === 12) ? 'pointer' : 'not-allowed',
                        opacity: (hasConsented && editName && aadhaarNo.length === 12) ? 1 : 0.5
                      }}
                    >
                      ⚙️ {t('simulate_card')}
                    </button>
                  </div>
                  {aadhaarCardPic && (
                    <div style={{ position: 'relative', width: '100%', height: '120px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
                      <img src={aadhaarCardPic} alt="Aadhaar Card Preview" style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
                      <button 
                        onClick={() => setAadhaarCardPic(null)}
                        style={{ position: 'absolute', top: '5px', right: '5px', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '0.8rem' }}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => {
                    if (!editName || !editAge || !editPlace || !aadhaarNo || !aadhaarCardPic) {
                      alert(t('fill_all_fields_alert'));
                      return;
                    }
                    if (aadhaarNo.length !== 12) {
                      alert(t('invalid_aadhaar_alert'));
                      return;
                    }
                    if (!hasConsented) {
                      alert(t('consent_warning_alert'));
                      return;
                    }
                    setVerifyStep(2);
                    startCamera();
                  }}
                  style={{
                    width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 'bold', color: '#fff',
                    backgroundColor: '#e141ec', border: 'none', borderRadius: '8px', cursor: 'pointer',
                    boxShadow: '0 0 10px rgba(225, 65, 236, 0.3)'
                  }}
                >
                  {t('aadhaar_confirm')} →
                </button>
              </div>
            )}

            {/* Step 2 Content: Selfie Capture */}
            {verifyStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', fontFamily: '"Inter", sans-serif' }}>
                <p style={{ color: '#ccc', fontSize: '0.85rem', textAlign: 'center', margin: '0 0 10px 0' }}>
                  {t('selfie_instruction')}
                </p>

                {/* Webcam Stream / Captured Preview Container */}
                <div style={{
                  position: 'relative', width: '220px', height: '220px', borderRadius: '50%',
                  overflow: 'hidden', border: '3px solid #e141ec', boxShadow: '0 0 15px rgba(225, 65, 236, 0.5)',
                  background: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                  {!capturedSelfie ? (
                    <>
                      {!window.isSecureContext && (
                        <div style={{ position: 'absolute', padding: '15px', textAlign: 'center', fontSize: '0.72rem', color: '#ffb74d', background: 'rgba(10, 10, 20, 0.96)', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', boxSizing: 'border-box', zIndex: 10 }}>
                          <span>{t('https_camera_warning')}</span>
                          <span style={{ fontSize: '0.65rem', marginTop: '8px', color: '#ccc' }}>{t('use_simulate_selfie')}</span>
                        </div>
                      )}
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      {cameraError && (
                        <div style={{ position: 'absolute', padding: '10px', textAlign: 'center', fontSize: '0.75rem', color: '#ff4c4c', background: 'rgba(0,0,0,0.8)' }}>
                          {cameraError}
                        </div>
                      )}
                    </>
                  ) : (
                    <img src={capturedSelfie} alt="Selfie Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>

                {/* Capture and Mock Controls */}
                {!capturedSelfie ? (
                  <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '10px' }}>
                    <button 
                      onClick={capturePhoto} 
                      style={{ flex: 1, padding: '10px', background: '#00e676', border: 'none', color: '#000', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      📸 {t('selfie_capture')}
                    </button>
                    <button 
                      onClick={simulateSelfie} 
                      style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(225, 65, 236, 0.5)', color: '#fff', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      ⚙️ {t('selfie_mock')}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '10px' }}>
                    <button 
                      onClick={() => { setCapturedSelfie(null); startCamera(); }} 
                      style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid #ff4c4c', color: '#ff4c4c', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      ↩ {t('selfie_retry')}
                    </button>
                    <button 
                      onClick={handleCompleteVerification} 
                      disabled={isVerifying}
                      style={{ flex: 1, padding: '10px', background: '#00e676', border: 'none', color: '#000', borderRadius: '8px', fontWeight: 'bold', cursor: isVerifying ? 'not-allowed' : 'pointer', boxShadow: '0 0 10px rgba(0, 230, 118, 0.4)' }}
                    >
                      {isVerifying ? t('saving') : `✓ ${t('selfie_submit')}`}
                    </button>
                  </div>
                )}
                
                <button 
                  onClick={() => { stopCamera(); setVerifyStep(1); setCapturedSelfie(null); }} 
                  style={{ background: 'transparent', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '0.85rem', marginTop: '5px', textDecoration: 'underline' }}
                >
                  ← {t('go_back_to_info')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terms and Conditions Modal */}
      {showTermsModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(10, 10, 20, 0.95)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          padding: '20px', zIndex: 120, backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(30, 25, 60, 0.98) 0%, rgba(20, 20, 35, 0.98) 100%)',
            border: '1px solid rgba(225, 65, 236, 0.5)', borderRadius: '16px', padding: '25px',
            width: '90%', maxWidth: '440px', position: 'relative',
            boxShadow: '0 0 40px rgba(225, 65, 236, 0.25)', color: '#fff',
            fontFamily: '"Inter", sans-serif'
          }}>
            <button 
              onClick={() => setShowTermsModal(false)} 
              style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', zIndex: 10 }}
            >
              ✕
            </button>
            
            <h3 style={{ fontSize: '1.1rem', marginBottom: '15px', color: '#e141ec', fontWeight: 'bold', borderBottom: '1px solid rgba(225, 65, 236, 0.2)', paddingBottom: '8px', textAlign: 'left' }}>
              {t('terms_title')}
            </h3>

            <div style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '5px', fontSize: '0.8rem', color: '#d0d0d0', lineHeight: '1.5', display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <strong>1. {t('terms_header_1')}:</strong>
                <p style={{ margin: '4px 0 0 0', color: '#aaa', fontSize: '0.75rem' }}>{t('terms_point_1')}</p>
              </div>
              
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <strong>2. {t('terms_header_2')}:</strong>
                <p style={{ margin: '4px 0 0 0', color: '#aaa', fontSize: '0.75rem' }}>{t('terms_point_2')}</p>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <strong>3. {t('terms_header_3')}:</strong>
                <p style={{ margin: '4px 0 0 0', color: '#aaa', fontSize: '0.75rem' }}>{t('terms_point_3')}</p>
              </div>

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '10px', marginTop: '5px', fontSize: '0.75rem', color: '#999' }}>
                {t('terms_disclaimer')}
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowTermsModal(false)}
                style={{
                  background: 'linear-gradient(90deg, #e141ec 0%, #a21caf 100%)',
                  border: 'none', borderRadius: '8px', padding: '8px 16px',
                  color: '#fff', fontWeight: 'bold', fontSize: '0.8rem',
                  cursor: 'pointer', boxShadow: '0 4px 10px rgba(225, 65, 236, 0.3)'
                }}
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkerDashboard;
