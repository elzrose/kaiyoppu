import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, getDocs, addDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { Html5Qrcode } from 'html5-qrcode';

const HirerDashboard = () => {
  const { t } = useTranslation();
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  // Hirer Profile State
  const [userData, setUserData] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editPlace, setEditPlace] = useState('');
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [aadhaarNo, setAadhaarNo] = useState('');
  const [aadhaarCardPic, setAadhaarCardPic] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Hiring History State
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'history'
  const [hiringHistory, setHiringHistory] = useState([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  
  // Mobile Menu State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Workers Directory State
  const [workers, setWorkers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingWorkers, setLoadingWorkers] = useState(true);

  // Scan & Hire State
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanUid, setScanUid] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [scanResultHistory, setScanResultHistory] = useState([]);
  const [scanError, setScanError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [matchesConfirmed, setMatchesConfirmed] = useState(false);
  const [showMismatchForm, setShowMismatchForm] = useState(false);
  const [mismatchComment, setMismatchComment] = useState('');
  const [isReportingMismatch, setIsReportingMismatch] = useState(false);
  const [isMismatchReported, setIsMismatchReported] = useState(false);

  // Notifications State
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [notifTab, setNotifTab] = useState('received'); // 'received' | 'sent' | 'system'
  const [receivedNotifs, setReceivedNotifs] = useState([]);
  const [sentNotifs, setSentNotifs] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [systemNotifications, setSystemNotifications] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  const [scanMode, setScanMode] = useState('text'); // 'camera' | 'upload' | 'text'
  const [isCameraActive, setIsCameraActive] = useState(false);
  const qrCodeScannerRef = useRef(null);

  useEffect(() => {
    let isActive = true;
    let html5QrcodeInstance = null;

    if (showScanModal && scanMode === 'camera') {
      const startScanner = async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, 450));
          if (!isActive) return;

          const qrReaderEl = document.getElementById("qr-reader");
          if (!qrReaderEl) return;

          const html5Qrcode = new Html5Qrcode("qr-reader");
          html5QrcodeInstance = html5Qrcode;
          qrCodeScannerRef.current = html5Qrcode;

          const startConfig = {
            fps: 10,
            qrbox: (width, height) => {
              const minEdge = Math.min(width, height);
              const qrboxSize = Math.floor(minEdge * 0.65);
              return {
                width: qrboxSize,
                height: qrboxSize
              };
            }
          };

          const successCallback = async (decodedText) => {
            setScanUid(decodedText);
            if (html5Qrcode.isScanning) {
              await html5Qrcode.stop();
            }
            setIsCameraActive(false);
            await performVerify(decodedText);
          };

          try {
            // First attempt: Rear camera
            await html5Qrcode.start(
              { facingMode: "environment" },
              startConfig,
              successCallback,
              () => {}
            );
            if (isActive) {
              setIsCameraActive(true);
              setScanError('');
            } else {
              if (html5Qrcode.isScanning) {
                await html5Qrcode.stop();
              }
            }
          } catch (firstErr) {
            console.warn("First QR scanner attempt failed, trying fallback:", firstErr);
            if (!isActive) return;

            try {
              // Second attempt: Fallback to user/front camera or any default
              await html5Qrcode.start(
                { facingMode: "user" },
                startConfig,
                successCallback,
                () => {}
              );
              if (isActive) {
                setIsCameraActive(true);
                setScanError('');
              } else {
                if (html5Qrcode.isScanning) {
                  await html5Qrcode.stop();
                }
              }
            } catch (secondErr) {
              console.error("All QR camera attempts failed:", secondErr);
              if (isActive) {
                setScanError("Failed to access camera. Please verify permissions or type the UID manually.");
                setIsCameraActive(false);
              }
            }
          }
        } catch (err) {
          console.error("Failed to start QR camera:", err);
          if (isActive) {
            setScanError("Failed to access camera. Please verify permissions or type the UID manually.");
            setIsCameraActive(false);
          }
        }
      };

      startScanner();
    }

    return () => {
      isActive = false;
      if (html5QrcodeInstance) {
        const stopScanner = async () => {
          if (html5QrcodeInstance.isScanning) {
            try {
              await html5QrcodeInstance.stop();
            } catch (stopErr) {
              console.error("Failed to stop scanner in cleanup:", stopErr);
            }
          }
          try {
            html5QrcodeInstance.clear();
          } catch (clearErr) {
            // ignore
          }
        };
        stopScanner();
      }
    };
  }, [showScanModal, scanMode]);
  const [invitedWorkers, setInvitedWorkers] = useState([]);
  const [blockedWorkers, setBlockedWorkers] = useState([]);

  const syncHistoryWithRequests = async () => {
    if (!currentUser?.uid) return;
    try {
      const q = query(
        collection(db, 'requests'),
        where('status', '==', 'accepted')
      );
      const snap = await getDocs(q);
      const acceptedRequests = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(req => req.fromUid === currentUser.uid || req.toUid === currentUser.uid);

      if (acceptedRequests.length === 0) return;

      const historyRef = collection(db, 'users', currentUser.uid, 'hiringHistory');
      const historySnap = await getDocs(historyRef);
      const currentHistory = historySnap.docs.map(doc => doc.data());

      for (const req of acceptedRequests) {
        const isLogged = currentHistory.some(h => 
          h.requestId === req.id ||
          (h.workerUid === req.fromUid || h.workerUid === req.toUid)
        );

        if (!isLogged) {
          const partnerUid = req.fromUid === currentUser.uid ? req.toUid : req.fromUid;
          const partnerName = req.fromUid === currentUser.uid ? req.toName : req.fromName;
          
          let partnerRole = 'Worker';
          try {
            const partnerDoc = await getDoc(doc(db, 'users', partnerUid));
            if (partnerDoc.exists()) {
              partnerRole = partnerDoc.data().role || 'Worker';
            }
          } catch (e) {}

          await addDoc(historyRef, {
            date: new Date(req.timestamp?.toDate ? req.timestamp.toDate() : Date.now()).toLocaleDateString('en-GB'),
            workerName: partnerName,
            workerUid: partnerUid,
            role: partnerRole,
            amount: 'Negotiable',
            remark: 'Waiting for worker remarks.',
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
      
      const sentInvitations = allReqs.filter(r => r.fromUid === currentUser.uid && r.type === 'invitation');
      setSentNotifs(sentInvitations);
      
      const receivedApps = allReqs.filter(r => r.toUid === currentUser.uid && r.type === 'application');
      setReceivedNotifs(receivedApps);
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
            setUserData(data);
            setEditName(data.name || currentUser.displayName || '');
            setEditAge(data.age || '');
            setEditPlace(data.place || '');
            
            // Sync local hiring history with accepted requests from root collection
            await syncHistoryWithRequests();
          }
        } catch (error) {
          console.error("Failed to fetch user data", error);
        }
      }
    };

    const fetchWorkers = async () => {
      try {
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);
        const workersList = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          if (data.role === 'Worker' || data.role === 'worker') {
            // Add mock status for demonstration
            data.status = Math.random() > 0.3 ? 'Looking for job' : 'Currently Hired';
            workersList.push({ id: doc.id, ...data });
          }
        });
        setWorkers(workersList);
      } catch (error) {
        console.error("Failed to fetch workers", error);
      } finally {
        setLoadingWorkers(false);
      }
    };

    fetchUserData();
    fetchMyRequests();
    fetchWorkers();
  }, [currentUser]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error("Failed to log out", error);
    }
  };

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
    ctx.fillText("Name / பெயர்: " + (editName || "Hirer Name"), 140, 110);
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

  const handleVerifyAadhar = async () => {
    if (!editName || !editAge || !editPlace || !aadhaarNo || !aadhaarCardPic) {
      alert("Please fill out all fields and provide an Aadhaar card photo.");
      return;
    }
    if (aadhaarNo.length !== 12) {
      alert("Please enter a valid 12-digit Aadhaar Number.");
      return;
    }

    setIsVerifying(true);
    try {
      let verificationStatus = 'verified';
      let cctnsRemark = 'Cleared by CCTNS';
      let isVerified = true;

      // 1. CCTNS background lookup query
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
            isVerified = false;
          } else if (match.type === 'fir') {
            verificationStatus = 'on_review';
            cctnsRemark = match.offense || 'CCTNS Review: FIR pending';
            isVerified = true;
          }
        }
      } catch (checkErr) {
        console.error("CCTNS Verification failed, falling back to verified", checkErr);
      }

      // 2. Save details to Firestore
      const userDocRef = doc(db, 'users', currentUser.uid);
      const verifyData = {
        name: editName,
        age: editAge,
        place: editPlace,
        aadhaarNumber: aadhaarNo,
        aadhaarCardPic: aadhaarCardPic || '',
        isVerified: isVerified,
        lastVerifiedAt: new Date().toISOString(),
        verificationStatus: verificationStatus,
        cctnsRemark: cctnsRemark
      };

      await updateDoc(userDocRef, verifyData);
      setUserData(prev => ({ ...prev, ...verifyData }));
      setShowVerifyModal(false);
      setAadhaarNo('');
      setAadhaarCardPic(null);

      // 3. Display verification result alerts
      if (verificationStatus === 'blocked') {
        alert("Verification completed. CCTNS Background Check: BLOCKED (Criminal Record Found)");
      } else if (verificationStatus === 'on_review') {
        alert("Verification completed. CCTNS Background Check: UNDER POLICE REVIEW (FIR Record Found)");
      } else {
        alert("Verification successfully completed!");
      }
    } catch (error) {
      console.error("Failed to update profile", error);
      alert("Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const fetchHistory = async () => {
    setActiveTab('history');
    setIsFetchingHistory(true);
    try {
      const historyRef = collection(db, 'users', currentUser.uid, 'hiringHistory');
      const snapshot = await getDocs(historyRef);
      if (!snapshot.empty) {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort newest first
        items.sort((a, b) => {
          const timeA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
          const timeB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
          return timeB - timeA;
        });
        setHiringHistory(items);
      } else {
        // Fallback mock hiring history
        setHiringHistory([
          { id: '1', date: '12/04/2025', workerName: 'Raju K', role: 'Plumber', amount: '₹1500', remark: 'Good hirer, paid on time.' },
          { id: '2', date: '05/02/2025', workerName: 'Gopi T', role: 'Electrician', amount: '₹800', remark: 'Clear instructions provided.' }
        ]);
      }
    } catch (error) {
      console.error("Failed to fetch hiring history", error);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const stopScanning = async () => {
    if (qrCodeScannerRef.current && qrCodeScannerRef.current.isScanning) {
      try {
        await qrCodeScannerRef.current.stop();
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
      setIsCameraActive(false);
    }
  };

  const performVerify = async (uid) => {
    if (!uid) return;
    setIsScanning(true);
    setScanError('');
    setScanResult(null);
    setScanResultHistory([]);
    setMatchesConfirmed(false);
    setShowMismatchForm(false);
    setMismatchComment('');
    setIsMismatchReported(false);

    try {
      const docRef = doc(db, "users", uid.trim());
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        
        // Expiration check: check if lastVerifiedAt is older than 6 months (180 days)
        let expired = false;
        if (data.isVerified && data.lastVerifiedAt) {
          const lastVerified = new Date(data.lastVerifiedAt);
          const now = new Date();
          const diffTime = Math.abs(now - lastVerified);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays > 180) {
            expired = true;
          }
        }

        // Suspended check
        if (data.status === 'suspended' || data.isSuspended) {
          setScanError("❌ Worker account suspended by Admin.");
          setIsScanning(false);
          return;
        }

        // Fetch worker's work history
        try {
          const historyRef = collection(db, 'users', docSnap.id, 'workHistory');
          const historySnap = await getDocs(historyRef);
          const historyData = historySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          historyData.sort((a, b) => (b.sno || 0) - (a.sno || 0));
          setScanResultHistory(historyData);
        } catch (historyErr) {
          console.warn("Could not fetch worker's work history: ", historyErr);
          setScanResultHistory([]);
        }

        setScanResult({ id: docSnap.id, ...data, isExpiredScan: expired });
        await stopScanning();
      } else {
        setScanError("❌ Worker not found");
      }
    } catch (err) {
      console.error("Error scanning worker:", err);
      setScanError("❌ Error fetching worker data");
    } finally {
      setIsScanning(false);
    }
  };

  const handleScan = async (e) => {
    e.preventDefault();
    if (!scanUid.trim()) return;
    await performVerify(scanUid);
  };

  const handleFileUploadScan = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsScanning(true);
    setScanError('');
    try {
      const html5Qrcode = new Html5Qrcode("qr-reader-dummy");
      const decodedText = await html5Qrcode.scanFile(file, false);
      html5Qrcode.clear();
      await performVerify(decodedText);
    } catch (err) {
      console.error("File QR scan error:", err);
      setScanError("❌ No QR code detected in this image. Try taking a clearer close-up photo.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleReportMismatch = async () => {
    if (!scanResult) return;
    setIsReportingMismatch(true);
    try {
      const reportData = {
        workerId: scanResult.id,
        workerName: scanResult.name || scanResult.displayName || 'N/A',
        workerEmail: scanResult.email || 'N/A',
        workerPhoto: scanResult.profilePic || '',
        workerAadhaarNumber: scanResult.aadhaarNumber || '',
        workerAadhaarCardPic: scanResult.aadhaarCardPic || '',
        reportedByUid: currentUser.uid,
        reportedByName: userData?.name || currentUser.displayName || 'Hirer',
        reportedByEmail: currentUser.email,
        comment: mismatchComment,
        timestamp: serverTimestamp(),
        status: 'pending'
      };
      
      // Save report in Firestore mismatchReports collection
      await addDoc(collection(db, 'mismatchReports'), reportData);
      
      // Block/Lock the worker account immediately until manual admin review
      const workerDocRef = doc(db, 'users', scanResult.id);
      await updateDoc(workerDocRef, {
        isVerified: false,
        verificationStatus: 'blocked',
        cctnsRemark: `Flagged for selfie mismatch review. Comment: "${mismatchComment}"`
      });

      // Log it in activity logs for admin dashboard
      await addDoc(collection(db, 'adminLogs'), {
        action: 'REPORT_MISMATCH',
        targetUid: scanResult.id,
        targetName: scanResult.name || scanResult.displayName || scanResult.email,
        adminEmail: currentUser.email,
        timestamp: serverTimestamp(),
        detail: `Mismatch reported by Hirer: ${mismatchComment}`
      });

      setIsMismatchReported(true);
      alert(t('mismatch_reported_msg') || 'Mismatch reported to admin successfully.');
      setScanResult(null); // Clear scan view
      setScanResultHistory([]);
      setShowScanModal(false);
    } catch (err) {
      console.error("Failed to report mismatch:", err);
      alert("Failed to send mismatch report.");
    } finally {
      setIsReportingMismatch(false);
    }
  };

  const handleInvite = async (worker) => {
    try {
      const docRef = await addDoc(collection(db, 'requests'), {
        fromUid: currentUser.uid,
        fromName: userData?.name || currentUser.displayName || 'Hirer',
        fromEmail: currentUser.email,
        toUid: worker.id,
        toName: worker.name || worker.displayName || 'Unnamed Worker',
        toEmail: worker.email,
        type: 'invitation',
        status: 'pending',
        timestamp: serverTimestamp()
      });

      const newReq = {
        id: docRef.id,
        fromUid: currentUser.uid,
        fromName: userData?.name || currentUser.displayName || 'Hirer',
        fromEmail: currentUser.email,
        toUid: worker.id,
        toName: worker.name || worker.displayName || 'Unnamed Worker',
        toEmail: worker.email,
        type: 'invitation',
        status: 'pending'
      };

      setInvitedWorkers(prev => [...prev, worker.id]);
      setSentNotifs(prev => [...prev, newReq]);
      setMyRequests(prev => [...prev, newReq]);
      alert("Invitation sent successfully!");
    } catch (error) {
      console.error("Error inviting", error);
      alert("Failed to send invitation.");
    }
  };

  const handleBlock = (workerId) => {
    const reason = prompt("Please provide a reason for reporting/blocking this Worker:");
    if (reason) {
      setBlockedWorkers(prev => [...prev, workerId]);
      alert("Worker has been reported and blocked.");
    }
  };

  const fetchNotifications = async () => {
    setShowNotificationsModal(true);
    setLoadingNotifs(true);
    try {
      await fetchMyRequests();

      const sysRef = collection(db, 'users', currentUser.uid, 'systemNotifications');
      const sysSnap = await getDocs(sysRef);
      const sysData = sysSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      sysData.sort((a, b) => {
        const tA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
        const tB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
        return tB - tA;
      });
      setSystemNotifications(sysData);
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

      // Add to hiring history on acceptance (safe write to own document)
      if (newStatus === 'accepted' && n) {
        let workerRole = 'Worker';
        try {
          const workerDocRef = doc(db, 'users', n.fromUid);
          const workerDoc = await getDoc(workerDocRef);
          if (workerDoc.exists()) {
            workerRole = workerDoc.data().role || 'Worker';
          }
        } catch (e) {
          console.error("Error getting worker role:", e);
        }

        // 1. Write to Hirer's hiring history
        const hiringHistoryRef = collection(db, 'users', currentUser.uid, 'hiringHistory');
        await addDoc(hiringHistoryRef, {
          date: new Date().toLocaleDateString('en-GB'),
          workerName: n.fromName || 'Worker',
          workerUid: n.fromUid,
          role: workerRole,
          amount: 'Negotiable',
          remark: 'Waiting for worker remarks.',
          requestId: notifId,
          timestamp: serverTimestamp()
        });

        // Re-fetch hiring history to update local state in Hirer Dashboard
        const updatedSnap = await getDocs(hiringHistoryRef);
        const items = updatedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        items.sort((a, b) => {
          const timeA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
          const timeB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
          return timeB - timeA;
        });
        setHiringHistory(items);
      }
    } catch (error) {
      console.error("Error updating status", error);
    }
  };

  const filteredWorkers = workers.filter(w => 
    !blockedWorkers.includes(w.id) &&
    (w.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    w.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.place?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const tabStyle = (tabName) => ({
    flex: 1,
    padding: '12px',
    background: activeTab === tabName ? 'rgba(225, 65, 236, 0.2)' : 'transparent',
    border: 'none',
    borderBottom: activeTab === tabName ? '2px solid #e141ec' : '2px solid transparent',
    color: activeTab === tabName ? '#fff' : '#a0a0a0',
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
      fontFamily: '"Advent Pro", "Inter", sans-serif',
      padding: '80px 2rem 2rem 2rem', // Top padding for fixed header
      boxSizing: 'border-box',
      margin: 0,
      position: 'relative'
    }}>
      <nav className="dashboard-nav fixed">
        {isMobileMenuOpen && (
          <div className="mobile-menu-overlay hide-on-desktop" onClick={() => setIsMobileMenuOpen(false)}></div>
        )}
        <div>
          <h2 style={{
            margin: 0,
            fontSize: '1.8rem',
            fontWeight: '700',
            color: '#fff',
            letterSpacing: '3px',
            textShadow: '0 0 10px rgba(225, 65, 236, 0.4)'
          }}>
            {t('app_name')}
          </h2>
        </div>
        <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          ☰
        </button>

        <div className={`nav-actions ${isMobileMenuOpen ? 'open' : ''}`}>
          <button className="close-menu-btn hide-on-desktop" onClick={() => setIsMobileMenuOpen(false)}>✕</button>
        
        <LanguageSwitcher />

        {/* Notifications Button */}
        <button
          onClick={fetchNotifications}
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

        {/* Scan & Hire Button */}
        <button
          onClick={() => {
            if (userData?.isVerified) {
              setShowScanModal(true);
            } else {
              alert("Please verify your Aadhar in the Account section before scanning.");
            }
          }}
          style={{
            background: userData?.isVerified ? 'rgba(225, 65, 236, 0.2)' : 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(10px)',
            border: userData?.isVerified ? '1px solid rgba(225, 65, 236, 0.8)' : '1px solid rgba(255, 255, 255, 0.2)',
            color: userData?.isVerified ? '#fff' : '#888',
            padding: '10px 20px',
            borderRadius: '25px',
            cursor: userData?.isVerified ? 'pointer' : 'not-allowed',
            fontFamily: '"Inter", sans-serif',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: userData?.isVerified ? '0 0 10px rgba(225, 65, 236, 0.3)' : 'none'
          }}
          onMouseOver={(e) => {
            if (userData?.isVerified) {
              e.currentTarget.style.backgroundColor = 'rgba(225, 65, 236, 0.4)';
              e.currentTarget.style.boxShadow = '0 0 15px rgba(225, 65, 236, 0.6)';
            }
          }}
          onMouseOut={(e) => {
            if (userData?.isVerified) {
              e.currentTarget.style.backgroundColor = 'rgba(225, 65, 236, 0.2)';
              e.currentTarget.style.boxShadow = '0 0 10px rgba(225, 65, 236, 0.3)';
            }
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2z"/>
          </svg>
          <span className="hide-on-mobile">
          {t('scan_hire')}</span>
        </button>

        {/* Account Button */}
        <button
          onClick={() => { setShowProfileModal(true); setActiveTab('profile'); }}
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
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(225, 65, 236, 0.2)';
            e.currentTarget.style.boxShadow = '0 0 15px rgba(225, 65, 236, 0.4)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
          <span className="hide-on-mobile">{t('account')}</span>
        </button>
      </div>
      </nav>

      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', marginTop: '60px' }}>
        <h1 className="dashboard-title" style={{
          fontSize: '3rem',
          fontWeight: 'bold',
          marginBottom: '0.5rem',
          color: '#e141ec',
          textShadow: '0 0 15px rgba(225, 65, 236, 0.5)',
          letterSpacing: '2px',
          textAlign: 'center'
        }}>
          {t('hirer_dash')}
        </h1>
        <h2 style={{ textAlign: 'center', color: '#fff', fontSize: '1.8rem', marginBottom: '1rem', fontFamily: '"Inter", sans-serif' }}>
          {t('worker_directory')}
        </h2>
        <p style={{ textAlign: 'center', color: '#b0b0b0', marginBottom: '2rem', fontFamily: '"Inter", sans-serif' }}>
          {t('worker_directory_desc')}
        </p>

        {/* Search Bar */}
        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'center' }}>
          <input
            type="text"
            placeholder={t('search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '500px',
              padding: '14px 20px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(225, 65, 236, 0.4)',
              borderRadius: '25px',
              color: '#fff',
              fontSize: '1rem',
              outline: 'none',
              backdropFilter: 'blur(10px)',
              transition: 'border-color 0.3s ease, box-shadow 0.3s ease'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#e141ec';
              e.target.style.boxShadow = '0 0 15px rgba(225, 65, 236, 0.4)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(225, 65, 236, 0.4)';
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Workers Grid */}
        {loadingWorkers ? (
          <div style={{ textAlign: 'center', color: '#e141ec', padding: '40px' }}>Loading workers...</div>
        ) : filteredWorkers.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: '40px' }}>{t('no_workers_found')}</div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px'
          }}>
            {filteredWorkers.map(worker => (
              <div key={worker.id} style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '20px',
                backdropFilter: 'blur(10px)',
                transition: 'transform 0.3s ease, border-color 0.3s ease',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-5px)';
                e.currentTarget.style.borderColor = 'rgba(225, 65, 236, 0.5)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#fff' }}>{worker.name || worker.displayName || 'Unnamed'}</h3>
                  <span style={{
                    fontSize: '0.75rem',
                    padding: '4px 8px',
                    borderRadius: '10px',
                    background: worker.status === 'Looking for job' ? 'rgba(0, 230, 118, 0.1)' : 'rgba(255, 152, 0, 0.1)',
                    color: worker.status === 'Looking for job' ? '#00e676' : '#ff9800',
                    border: `1px solid ${worker.status === 'Looking for job' ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255, 152, 0, 0.3)'}`
                  }}>
                    {worker.status === 'Looking for job' ? t('status_looking') : t('status_hired')}
                  </span>
                </div>
                
                <p style={{ margin: '0 0 5px 0', fontSize: '0.9rem', color: '#b0b0b0', fontFamily: '"Inter", sans-serif' }}>
                  📍 {worker.place || t('location_not_specified')}
                </p>
                <p style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: '#b0b0b0', fontFamily: '"Inter", sans-serif' }}>
                  ✉️ {worker.email}
                </p>

                <div style={{ marginTop: 'auto', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#e141ec', fontSize: '0.9rem', fontWeight: 'bold', cursor: 'pointer' }}>{t('view_works')}</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(() => {
                      const relReq = myRequests.find(n => 
                        (n.fromUid === currentUser.uid && n.toUid === worker.id) ||
                        (n.fromUid === worker.id && n.toUid === currentUser.uid)
                      );
                      if (relReq) {
                        if (relReq.status === 'accepted') {
                          return <span style={{ color: '#00e676', fontSize: '0.9rem', fontWeight: 'bold', border: '1px solid rgba(0,230,118,0.3)', padding: '4px 8px', borderRadius: '6px', background: 'rgba(0,230,118,0.1)' }}>📞 +91 9876543210</span>;
                        } else if (relReq.status === 'rejected') {
                          return <span style={{ color: '#ff4c4c', fontSize: '0.9rem', fontWeight: 'bold', border: '1px solid rgba(255,76,76,0.3)', padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,76,76,0.1)' }}>{t('status_rejected')}</span>;
                        } else {
                          return <span style={{ color: '#b0b0b0', fontSize: '0.9rem', fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)' }}>{t('status_pending')}</span>;
                        }
                      } else {
                        return (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleInvite(worker); }}
                            style={{ background: '#e141ec', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', transition: 'background 0.2s' }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#c038c8'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#e141ec'}
                          >
                            {t('invite')}
                          </button>
                        );
                      }
                    })()}
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleBlock(worker.id); }}
                      style={{ background: 'transparent', color: '#ff4c4c', border: '1px solid rgba(255, 76, 76, 0.4)', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}
                    >
                      {t('report')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Account Modal */}
      {showProfileModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: '40px 0',
          overflowY: 'auto',
          zIndex: 100
        }}>
          <div className="responsive-modal" style={{ maxWidth: activeTab === 'history' ? '700px' : '400px' }}>
            <button
              onClick={() => setShowProfileModal(false)}
              style={{
                position: 'absolute', top: '15px', right: '15px',
                background: 'transparent', border: 'none', color: '#fff',
                fontSize: '1.2rem', cursor: 'pointer', zIndex: 10
              }}
            >
              ✕
            </button>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <button onClick={() => setActiveTab('profile')} style={tabStyle('profile')}>{t('profile')}</button>
              <button onClick={fetchHistory} style={tabStyle('history')}>{t('hiring_history')}</button>
            </div>

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
                      OFFICIAL GOVT/ADMIN REMARK
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
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#888' }}>Aadhaar Number</span><span>{userData.aadhaarNumber ? `xxxx-xxxx-${userData.aadhaarNumber.slice(-4)}` : 'N/A'}</span></div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <p style={{ color: '#ff9800', fontSize: '0.9rem', textAlign: 'center', margin: '0 0 10px 0' }}>
                      {t('qr_unverified_msg') || "Please verify your profile to activate all features."}
                    </p>

                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#b0b0b0' }}>{t('full_name')}</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{
                          width: '100%', padding: '10px', borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: '#fff', outline: 'none', boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#b0b0b0' }}>{t('age')}</label>
                      <input
                        type="number"
                        value={editAge}
                        onChange={(e) => setEditAge(e.target.value)}
                        style={{
                          width: '100%', padding: '10px', borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: '#fff', outline: 'none', boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#b0b0b0' }}>{t('place')}</label>
                      <input
                        type="text"
                        value={editPlace}
                        onChange={(e) => setEditPlace(e.target.value)}
                        style={{
                          width: '100%', padding: '10px', borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)',
                          color: '#fff', outline: 'none', boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <button
                      onClick={() => { setShowProfileModal(false); setShowVerifyModal(true); }}
                      style={{
                        marginTop: '15px',
                        width: '100%',
                        padding: '12px',
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        color: '#fff',
                        backgroundColor: '#e141ec',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 0 15px rgba(225, 65, 236, 0.4)'
                      }}
                    >
                      {t('verify_aadhar') || "Start Verification Wizard"}
                    </button>
                  </div>
                )}

                <button
                  onClick={handleLogout}
                  style={{
                    marginTop: '10px',
                    width: '100%',
                    padding: '10px',
                    fontSize: '0.9rem',
                    color: '#ff6b6b',
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(255, 107, 107, 0.3)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 107, 107, 0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {t('sign_out')}
                </button>
              </div>
            )}

            {activeTab === 'history' && (
              <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto', fontFamily: '"Inter", sans-serif' }}>
                {isFetchingHistory ? (
                  <div style={{ textAlign: 'center', color: '#b0b0b0', padding: '20px' }}>Loading history...</div>
                ) : hiringHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#b0b0b0', padding: '20px' }}>No hiring history available.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', fontSize: '0.9rem', textAlign: 'left', minWidth: '600px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(225, 65, 236, 0.4)', color: '#e141ec' }}>
                        <th style={{ padding: '12px 8px' }}>{t('date')}</th>
                        <th style={{ padding: '12px 8px' }}>{t('worker_name')}</th>
                        <th style={{ padding: '12px 8px' }}>{t('role')}</th>
                        <th style={{ padding: '12px 8px' }}>{t('amount')}</th>
                        <th style={{ padding: '12px 8px' }}>{t('worker_remarks')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hiringHistory.map((job, idx) => (
                        <tr key={job.id} style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                        }}>
                          <td style={{ padding: '14px 8px', color: '#b0b0b0' }}>{job.date}</td>
                          <td style={{ padding: '14px 8px', fontWeight: 'bold' }}>{job.workerName}</td>
                          <td style={{ padding: '14px 8px' }}>{job.role}</td>
                          <td style={{ padding: '14px 8px', color: '#00e676', fontWeight: 'bold' }}>{job.amount}</td>
                          <td style={{ padding: '14px 8px', fontStyle: 'italic', color: '#d0d0d0' }}>"{job.remark}"</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div style={{ marginTop: '20px', fontSize: '0.8rem', color: '#a0a0a0', textAlign: 'center' }}>
                  Note: Remarks in the hiring history are provided and edited exclusively by workers.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
              <button onClick={() => setNotifTab('received')} style={tabStyle('received', notifTab)}>{t('received_applications')}</button>
              <button onClick={() => setNotifTab('sent')} style={tabStyle('sent', notifTab)}>{t('sent_invitations')}</button>
              <button onClick={() => setNotifTab('system')} style={tabStyle('system', notifTab)}>System Alerts</button>
            </div>

            <div style={{ overflowY: 'auto', maxHeight: '400px', paddingRight: '10px', fontFamily: '"Inter", sans-serif' }}>
              {loadingNotifs ? (
                <div style={{ textAlign: 'center', color: '#b0b0b0', padding: '20px' }}>Loading...</div>
              ) : notifTab === 'received' ? (
                receivedNotifs.length === 0 ? <div style={{ textAlign: 'center', color: '#888' }}>{t('no_applications_received')}</div> : (
                  <div style={{ display: 'grid', gap: '15px' }}>
                    {receivedNotifs.map(n => (
                      <div key={n.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ fontWeight: 'bold', color: '#fff', marginBottom: '5px' }}>{n.fromName} {t('applied_for_work')}</div>
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
                                Status: {n.status === 'accepted' ? t('status_accepted') : n.status === 'rejected' ? t('status_rejected') : t('status_pending')}
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
              ) : notifTab === 'sent' ? (
                sentNotifs.length === 0 ? <div style={{ textAlign: 'center', color: '#888' }}>{t('no_invitations_sent')}</div> : (
                  <div style={{ display: 'grid', gap: '15px' }}>
                    {sentNotifs.map(n => (
                      <div key={n.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ fontWeight: 'bold', color: '#fff', marginBottom: '5px' }}>{t('invited')} {n.toName}</div>
                        <div style={{ color: '#b0b0b0', fontSize: '0.9rem', marginBottom: '10px' }}>Status: {n.status === 'accepted' ? t('status_accepted') : n.status === 'rejected' ? t('status_rejected') : t('status_pending')}</div>
                        {n.status === 'accepted' && (
                          <div style={{ color: '#00e676', fontWeight: 'bold' }}>📞 +91 9876543210</div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                systemNotifications.length === 0 ? <div style={{ textAlign: 'center', color: '#888' }}>No system alerts received.</div> : (
                  <div style={{ display: 'grid', gap: '15px' }}>
                    {systemNotifications.map(n => (
                      <div key={n.id} style={{ background: 'rgba(225,65,236,0.05)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(225,65,236,0.2)' }}>
                        <div style={{ fontWeight: 'bold', color: '#e141ec', marginBottom: '5px' }}>📢 {n.title || 'System Alert'}</div>
                        <div style={{ color: '#fff', fontSize: '0.95rem', marginBottom: '8px' }}>{n.message}</div>
                        <div style={{ color: '#666', fontSize: '0.75rem' }}>
                          {n.timestamp?.toDate ? n.timestamp.toDate().toLocaleString() : new Date(n.timestamp || 0).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Aadhaar Verification Modal */}
      {showVerifyModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
          padding: '40px 0', overflowY: 'auto', zIndex: 100
        }}>
          <div className="responsive-modal" style={{ maxWidth: '400px' }}>
            <button 
              onClick={() => { setShowVerifyModal(false); setAadhaarNo(''); setAadhaarCardPic(null); }} 
              style={{
                position: 'absolute', top: '15px', right: '15px',
                background: 'transparent', border: 'none', color: '#fff',
                fontSize: '1.2rem', cursor: 'pointer', zIndex: 10
              }}
            >
              ✕
            </button>
            
            <h2 style={{ fontSize: '1.6rem', marginBottom: '20px', color: '#e141ec', textAlign: 'center', fontWeight: 'bold' }}>
              {t('verify_step_aadhaar') || "Aadhaar Verification"}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', fontFamily: '"Inter", sans-serif' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#ccc', marginBottom: '5px' }}>{t('full_name')}</label>
                <input 
                  type="text" 
                  value={editName} 
                  onChange={(e) => setEditName(e.target.value)} 
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff', boxSizing: 'border-box' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#ccc', marginBottom: '5px' }}>{t('age')}</label>
                <input 
                  type="number" 
                  value={editAge} 
                  onChange={(e) => setEditAge(e.target.value)} 
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff', boxSizing: 'border-box' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#ccc', marginBottom: '5px' }}>{t('place')}</label>
                <input 
                  type="text" 
                  value={editPlace} 
                  onChange={(e) => setEditPlace(e.target.value)} 
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff', boxSizing: 'border-box' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#ccc', marginBottom: '5px' }}>Aadhaar Card Number</label>
                <input 
                  type="text" 
                  maxLength="12"
                  placeholder={t('aadhaar_placeholder') || "Enter 12-digit Aadhaar Number"}
                  value={aadhaarNo} 
                  onChange={(e) => setAadhaarNo(e.target.value.replace(/\D/g, ''))} 
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff', boxSizing: 'border-box', letterSpacing: '1px' }} 
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#ccc', marginBottom: '5px' }}>Aadhaar Card Photo</label>
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
                    style={{ display: 'none' }}
                    id="aadhaar-file-input"
                  />
                  <label 
                    htmlFor="aadhaar-file-input"
                    style={{
                      flex: 1, padding: '10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px dashed rgba(225, 65, 236, 0.4)', color: '#e141ec', textAlign: 'center',
                      cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', transition: 'all 0.3s'
                    }}
                  >
                    📁 Upload Photo
                  </label>
                  <button
                    type="button"
                    onClick={simulateAadhaarCard}
                    disabled={!editName || aadhaarNo.length !== 12}
                    style={{
                      padding: '10px 15px', borderRadius: '8px', background: 'rgba(225, 65, 236, 0.15)',
                      border: '1px solid rgba(225, 65, 236, 0.3)', color: '#e141ec', fontWeight: 'bold',
                      fontSize: '0.85rem', cursor: (!editName || aadhaarNo.length !== 12) ? 'not-allowed' : 'pointer',
                      opacity: (!editName || aadhaarNo.length !== 12) ? 0.5 : 1
                    }}
                  >
                    ⚙️ Simulate Card
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
                onClick={handleVerifyAadhar}
                disabled={isVerifying}
                style={{
                  width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 'bold', color: '#fff',
                  backgroundColor: '#e141ec', border: 'none', borderRadius: '8px', cursor: 'pointer',
                  boxShadow: '0 0 10px rgba(225, 65, 236, 0.3)', marginTop: '10px'
                }}
              >
                {isVerifying ? 'Verifying...' : (t('aadhaar_confirm') || "Confirm & Verify") + " →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scan & Hire Modal */}
      {showScanModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(10, 10, 20, 0.96)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: '40px 0',
          overflowY: 'auto',
          zIndex: 100
        }}>
          {/* Dummy hidden element required by html5-qrcode for file based scans */}
          <div id="qr-reader-dummy" style={{ display: 'none' }}></div>

          <div style={{
            background: 'linear-gradient(135deg, rgba(36, 36, 62, 0.95) 0%, rgba(15, 12, 41, 0.95) 100%)',
            border: '1px solid rgba(225, 65, 236, 0.5)',
            borderRadius: '16px',
            padding: '40px 30px',
            width: '90%',
            maxWidth: '400px',
            boxShadow: '0 15px 40px rgba(225,65,236,0.2)',
            position: 'relative'
          }}>
            <button
              onClick={async () => {
                await stopScanning();
                setShowScanModal(false);
                setScanResult(null);
                setScanResultHistory([]);
                setScanError('');
                setScanUid('');
              }}
              style={{
                position: 'absolute', top: '15px', right: '15px',
                background: 'transparent', border: 'none', color: '#fff',
                fontSize: '1.2rem', cursor: 'pointer', zIndex: 10
              }}
            >
              ✕
            </button>

            {!scanResult ? (
              <>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', color: '#e141ec', textAlign: 'center' }}>
                  {scanMode === 'camera' ? 'Scan Worker QR' : scanMode === 'upload' ? 'Upload QR Image' : 'Enter Worker UID'}
                </h2>

                <div style={{
                  display: 'flex',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '4px',
                  marginBottom: '20px',
                  gap: '4px'
                }}>
                  <button
                    onClick={() => {
                      setScanMode('camera');
                      setScanError('');
                    }}
                    style={{
                      flex: 1,
                      background: scanMode === 'camera' ? 'rgba(225, 65, 236, 0.25)' : 'transparent',
                      color: scanMode === 'camera' ? '#fff' : '#a0a0a0',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 4px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    📷 Camera
                  </button>
                  <button
                    onClick={async () => {
                      await stopScanning();
                      setScanMode('upload');
                      setScanError('');
                    }}
                    style={{
                      flex: 1,
                      background: scanMode === 'upload' ? 'rgba(225, 65, 236, 0.25)' : 'transparent',
                      color: scanMode === 'upload' ? '#fff' : '#a0a0a0',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 4px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    📁 Upload QR
                  </button>
                  <button
                    onClick={async () => {
                      await stopScanning();
                      setScanMode('text');
                      setScanError('');
                    }}
                    style={{
                      flex: 1,
                      background: scanMode === 'text' ? 'rgba(225, 65, 236, 0.25)' : 'transparent',
                      color: scanMode === 'text' ? '#fff' : '#a0a0a0',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 4px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    ⌨️ Type UID
                  </button>
                </div>

                {scanMode === 'camera' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                    {!window.isSecureContext && (
                      <div style={{
                        padding: '12px 15px',
                        background: 'rgba(255, 152, 0, 0.15)',
                        border: '1px solid rgba(255, 152, 0, 0.4)',
                        borderRadius: '8px',
                        color: '#ffb74d',
                        fontSize: '0.82rem',
                        textAlign: 'center',
                        lineHeight: '1.4',
                        maxWidth: '320px',
                        boxSizing: 'border-box'
                      }}>
                        ⚠️ Mobile cameras require a secure connection (HTTPS). Please switch to the <strong>Type UID</strong> or <strong>Upload QR</strong> tab.
                      </div>
                    )}
                    <div 
                      id="qr-reader" 
                      style={{ 
                        width: '100%', 
                        maxWidth: '320px', 
                        height: '240px', 
                        borderRadius: '12px', 
                        overflow: 'hidden', 
                        border: '2px solid rgba(225, 65, 236, 0.3)',
                        background: '#000',
                        position: 'relative'
                      }}
                    >
                      {!isCameraActive && !scanError && (
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#b0b0b0', fontSize: '0.9rem' }}>
                          Starting camera...
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#b0b0b0', textAlign: 'center' }}>
                      Align the Worker's QR code within the frame to scan.
                    </span>
                  </div>
                )}

                {scanMode === 'upload' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
                    <div style={{
                      width: '100%',
                      padding: '30px 20px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px dashed rgba(225, 65, 236, 0.4)',
                      borderRadius: '12px',
                      textAlign: 'center',
                      boxSizing: 'border-box'
                    }}>
                      <input 
                        type="file" 
                        accept="image/*"
                        id="qr-file-input"
                        onChange={handleFileUploadScan}
                        style={{ display: 'none' }}
                      />
                      <label 
                        htmlFor="qr-file-input"
                        style={{
                          display: 'inline-block',
                          padding: '12px 24px',
                          background: '#e141ec',
                          color: '#fff',
                          borderRadius: '8px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          boxShadow: '0 0 15px rgba(225, 65, 236, 0.3)',
                          transition: 'all 0.3s ease'
                        }}
                      >
                        Select QR Image / Take Photo
                      </label>
                      <p style={{ margin: '15px 0 0 0', fontSize: '0.8rem', color: '#b0b0b0' }}>
                        Supports uploading screenshots or taking direct photos of QR codes.
                      </p>
                    </div>
                  </div>
                )}

                {scanMode === 'text' && (
                  <form onSubmit={handleScan} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <input 
                      type="text" 
                      placeholder="Worker UID"
                      value={scanUid}
                      onChange={(e) => setScanUid(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        background: 'rgba(0, 0, 0, 0.5)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '1rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                        transition: 'border-color 0.3s ease'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#e141ec'}
                      onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                    />

                    <button 
                      type="submit"
                      disabled={isScanning || !scanUid.trim()}
                      style={{
                        width: '100%',
                        padding: '14px',
                        background: '#e141ec',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        cursor: isScanning || !scanUid.trim() ? 'not-allowed' : 'pointer',
                        opacity: isScanning || !scanUid.trim() ? 0.7 : 1,
                        transition: 'all 0.3s ease',
                        boxShadow: '0 0 15px rgba(225, 65, 236, 0.3)'
                      }}
                    >
                      {isScanning ? 'Verifying...' : 'Verify Worker'}
                    </button>
                  </form>
                )}

                {scanError && (
                  <div style={{
                    marginTop: '15px',
                    padding: '15px',
                    background: 'rgba(255, 50, 50, 0.1)',
                    border: '1px solid rgba(255, 50, 50, 0.3)',
                    borderRadius: '8px',
                    color: '#ff6b6b',
                    textAlign: 'center',
                    fontWeight: '500',
                    fontSize: '0.9rem'
                  }}>
                    {scanError}
                  </div>
                )}
              </>
            ) : null}

            {scanResult && (
              <div style={{
                marginTop: '20px',
                padding: '20px',
                background: 'rgba(225, 65, 236, 0.05)',
                border: '1px solid rgba(225, 65, 236, 0.3)',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                {scanResult.isExpiredScan ? (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center', 
                    gap: '12px',
                    color: '#ff4c4c',
                    background: 'rgba(255, 76, 76, 0.1)',
                    border: '1px solid rgba(255, 76, 76, 0.3)',
                    padding: '15px',
                    borderRadius: '8px',
                    textAlign: 'center'
                  }}>
                    <span style={{ fontSize: '2rem' }}>⚠</span>
                    <span style={{ fontWeight: 'bold' }}>{t('verification_expired_warning') || 'Worker Verification Expired'}</span>
                    <span style={{ fontSize: '0.85rem', color: '#d0d0d0' }}>
                      This worker's 6-month verification period has expired. The worker must perform selfie re-verification on their dashboard.
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Selfie Profile Image Display */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '10px 0' }}>
                      <div style={{
                        width: '120px',
                        height: '120px',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        border: '3px solid #e141ec',
                        boxShadow: '0 0 15px rgba(225, 65, 236, 0.4)',
                        background: 'rgba(0,0,0,0.2)'
                      }}>
                        {scanResult.profilePic ? (
                          <img src={scanResult.profilePic} alt="Selfie Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '3rem', color: 'rgba(255,255,255,0.2)' }}>👤</div>
                        )}
                      </div>
                      <span style={{ fontSize: '0.8rem', color: '#e141ec', fontWeight: 'bold', marginTop: '8px', letterSpacing: '0.5px' }}>
                        🔒 OFFICIAL VERIFIED PHOTO
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                      <span style={{ color: '#888' }}>Name</span>
                      <span style={{ fontWeight: '500', color: '#fff' }}>{scanResult.name || scanResult.displayName || 'N/A'}</span>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                      <span style={{ color: '#888' }}>Role</span>
                      <span style={{ fontWeight: '500', color: '#e141ec' }}>{scanResult.role || 'Worker'}</span>
                    </div>

                    {/* Scanned Worker's Work History */}
                    <div style={{
                      marginTop: '10px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      padding: '12px'
                    }}>
                      <div style={{ 
                        fontWeight: 'bold', 
                        color: '#e141ec', 
                        fontSize: '0.9rem', 
                        marginBottom: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        💼 {t('work_history') || 'Work History'}
                      </div>
                      
                      {scanResultHistory.length === 0 ? (
                        <div style={{ color: '#888', fontSize: '0.8rem', fontStyle: 'italic', padding: '5px 0' }}>
                          No past work history recorded.
                        </div>
                      ) : (
                        <div style={{ 
                          maxHeight: '150px', 
                          overflowY: 'auto', 
                          display: 'flex', 
                          flexDirection: 'column', 
                          gap: '8px',
                          paddingRight: '4px'
                        }}>
                          {scanResultHistory.map((job) => (
                            <div key={job.id} style={{ 
                              background: 'rgba(255, 255, 255, 0.02)', 
                              border: '1px solid rgba(255, 255, 255, 0.03)', 
                              borderRadius: '6px', 
                              padding: '8px',
                              fontSize: '0.8rem'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontWeight: 'bold', color: '#fff' }}>{job.role}</span>
                                <span style={{ color: '#888' }}>{job.location}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b0b0b0', fontSize: '0.75rem', marginBottom: '4px' }}>
                                <span>Duration: {job.duration}</span>
                                <span style={{ color: '#00e676', fontWeight: 'bold' }}>{job.amount}</span>
                              </div>
                              {job.remark && (
                                <div style={{ 
                                  fontStyle: 'italic', 
                                  color: '#d0d0d0', 
                                  fontSize: '0.75rem', 
                                  borderTop: '1px dashed rgba(255,255,255,0.05)', 
                                  paddingTop: '4px',
                                  marginTop: '4px' 
                                }}>
                                  "{job.remark}"
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Yes/No Verification Question */}
                    {!matchesConfirmed && !showMismatchForm && (
                      <div style={{ 
                        marginTop: '15px', padding: '15px', background: 'rgba(255,255,255,0.02)', 
                        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', textAlign: 'center' 
                      }}>
                        <p style={{ margin: '0 0 15px 0', fontSize: '0.95rem', fontWeight: 'bold', color: '#fff', lineHeight: '1.4' }}>
                          {t('mismatch_question')}
                        </p>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button 
                            type="button"
                            onClick={() => setMatchesConfirmed(true)}
                            style={{ flex: 1, padding: '10px', background: '#00e676', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }}
                          >
                            ✓ {t('mismatch_yes')}
                          </button>
                          <button 
                            type="button"
                            onClick={() => setShowMismatchForm(true)}
                            style={{ flex: 1, padding: '10px', background: 'transparent', color: '#ff4c4c', border: '1px solid #ff4c4c', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }}
                          >
                            ✕ {t('mismatch_no')}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Matches Confirmed: Show Hire Action */}
                    {matchesConfirmed && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                        <div style={{ color: '#00e676', fontWeight: 'bold', textAlign: 'center', fontSize: '0.9rem', marginBottom: '5px' }}>
                          ✓ Match Confirmed. You can now initiate hiring.
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            handleInvite(scanResult);
                            setShowScanModal(false);
                            setScanResult(null);
                            setScanResultHistory([]);
                            setMatchesConfirmed(false);
                          }}
                          style={{
                            background: '#00e676',
                            color: '#000',
                            border: 'none',
                            padding: '12px',
                            borderRadius: '6px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            boxShadow: '0 0 10px rgba(0, 230, 118, 0.4)'
                          }}
                        >
                          Initiate Hire / Invite
                        </button>
                      </div>
                    )}

                    {/* Mismatch Form */}
                    {showMismatchForm && (
                      <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <label style={{ fontSize: '0.85rem', color: '#ff4c4c', fontWeight: 'bold' }}>Report Profile Mismatch to Admin</label>
                        <textarea 
                          placeholder={t('mismatch_comment_placeholder') || "Describe the mismatch (e.g. 'Photo is of a different person')"}
                          value={mismatchComment}
                          onChange={(e) => setMismatchComment(e.target.value)}
                          rows="3"
                          style={{
                            width: '100%', padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,76,76,0.3)',
                            borderRadius: '6px', color: '#fff', boxSizing: 'border-box', fontFamily: '"Inter", sans-serif', fontSize: '0.9rem'
                          }}
                        />
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button 
                            type="button"
                            onClick={() => { setShowMismatchForm(false); setMismatchComment(''); }}
                            style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#ccc', borderRadius: '6px', cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                          <button 
                            type="button"
                            onClick={handleReportMismatch}
                            disabled={isReportingMismatch || !mismatchComment.trim()}
                            style={{
                              flex: 1, padding: '10px', background: '#ff4c4c', color: '#fff', border: 'none', borderRadius: '6px',
                              fontWeight: 'bold', cursor: isReportingMismatch || !mismatchComment.trim() ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {isReportingMismatch ? 'Reporting...' : 'Submit Report'}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default HirerDashboard;
