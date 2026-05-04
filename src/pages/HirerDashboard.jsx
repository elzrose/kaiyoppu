import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';

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
  const [scanError, setScanError] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  // Notifications State
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [notifTab, setNotifTab] = useState('received'); // 'received' | 'sent'
  const [receivedNotifs, setReceivedNotifs] = useState([]);
  const [sentNotifs, setSentNotifs] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [invitedWorkers, setInvitedWorkers] = useState([]);
  const [blockedWorkers, setBlockedWorkers] = useState([]);

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
          }
        } catch (error) {
          console.error("Failed to fetch user data", error);
        }
      }
    };

    const fetchSentRequests = async () => {
      if (currentUser?.uid) {
        try {
          const sentRef = collection(db, 'users', currentUser.uid, 'sentRequests');
          const sentSnap = await getDocs(sentRef);
          setSentNotifs(sentSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (error) {
          console.error("Failed to fetch sent requests", error);
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
    fetchSentRequests();
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

  const handleVerifyAadhar = async () => {
    if (!editName || !editAge || !editPlace) {
      alert("Please fill in all fields before verifying.");
      return;
    }
    setIsVerifying(true);
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        name: editName,
        age: editAge,
        place: editPlace,
        isVerified: true
      });
      setUserData(prev => ({ ...prev, name: editName, age: editAge, place: editPlace, isVerified: true }));
    } catch (error) {
      console.error("Failed to update profile", error);
      alert("Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const fetchHistory = async () => {
    setActiveTab('history');
    if (hiringHistory.length > 0) return; 

    setIsFetchingHistory(true);
    try {
      // Mock hiring history
      setHiringHistory([
        { id: '1', date: '12/04/2025', workerName: 'Raju K', role: 'Plumber', amount: '₹1500', remark: 'Good hirer, paid on time.' },
        { id: '2', date: '05/02/2025', workerName: 'Gopi T', role: 'Electrician', amount: '₹800', remark: 'Clear instructions provided.' }
      ]);
    } catch (error) {
      console.error("Failed to fetch hiring history", error);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const handleScan = async (e) => {
    e.preventDefault();
    if (!scanUid.trim()) return;

    setIsScanning(true);
    setScanError('');
    setScanResult(null);

    try {
      const docRef = doc(db, "users", scanUid.trim());
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setScanResult(data);
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

  const handleInvite = async (worker) => {
    try {
      const sentRef = await addDoc(collection(db, 'users', currentUser.uid, 'sentRequests'), {
        toUid: worker.id,
        toName: worker.name || worker.displayName || 'Unnamed Worker',
        toEmail: worker.email,
        type: 'invitation',
        status: 'pending',
        timestamp: serverTimestamp()
      });
      
      await addDoc(collection(db, 'users', worker.id, 'receivedRequests'), {
        fromUid: currentUser.uid,
        fromName: userData?.name || currentUser.displayName || 'Hirer',
        fromEmail: currentUser.email,
        type: 'invitation',
        status: 'pending',
        timestamp: serverTimestamp(),
        senderDocId: sentRef.id
      });

      setInvitedWorkers(prev => [...prev, worker.id]);
      setSentNotifs(prev => [...prev, { id: sentRef.id, toUid: worker.id, toName: worker.name || 'Worker', type: 'invitation', status: 'pending' }]);
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
      const recRef = collection(db, 'users', currentUser.uid, 'receivedRequests');
      const recSnap = await getDocs(recRef);
      setReceivedNotifs(recSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const sentRef = collection(db, 'users', currentUser.uid, 'sentRequests');
      const sentSnap = await getDocs(sentRef);
      setSentNotifs(sentSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Failed to fetch notifications", error);
    } finally {
      setLoadingNotifs(false);
    }
  };

  const handleUpdateNotifStatus = async (notifId, newStatus) => {
    try {
      const docRef = doc(db, 'users', currentUser.uid, 'receivedRequests', notifId);
      await updateDoc(docRef, { status: newStatus });
      setReceivedNotifs(prev => prev.map(n => n.id === notifId ? { ...n, status: newStatus } : n));

      const n = receivedNotifs.find(x => x.id === notifId);
      if (n && n.senderDocId && n.fromUid) {
        const senderDocRef = doc(db, 'users', n.fromUid, 'sentRequests', n.senderDocId);
        await updateDoc(senderDocRef, { status: newStatus });
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
          marginBottom: '1rem',
          color: '#e141ec',
          textShadow: '0 0 15px rgba(225, 65, 236, 0.5)',
          letterSpacing: '2px',
          textAlign: 'center'
        }}>
          {t('worker_directory')}
        </h1>
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
                      const sentReq = sentNotifs.find(n => n.toUid === worker.id);
                      if (sentReq) {
                        if (sentReq.status === 'accepted') {
                          return <span style={{ color: '#00e676', fontSize: '0.9rem', fontWeight: 'bold', border: '1px solid rgba(0,230,118,0.3)', padding: '4px 8px', borderRadius: '6px', background: 'rgba(0,230,118,0.1)' }}>📞 +91 9876543210</span>;
                        } else if (sentReq.status === 'rejected') {
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
          alignItems: 'center',
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
                  onClick={handleVerifyAadhar}
                  disabled={isVerifying || userData?.isVerified}
                  style={{
                    marginTop: '15px',
                    width: '100%',
                    padding: '12px',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    color: '#fff',
                    backgroundColor: userData?.isVerified ? '#2e7d32' : '#e141ec',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: userData?.isVerified ? 'default' : 'pointer',
                    transition: 'all 0.3s ease',
                    opacity: isVerifying ? 0.7 : 1
                  }}
                >
                  {isVerifying ? 'Verifying...' : userData?.isVerified ? t('verified') : t('verify_aadhar')}
                </button>

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
          backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100
        }}>
          <div className="responsive-modal" style={{ maxWidth: '600px' }}>
            <button onClick={() => setShowNotificationsModal(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', zIndex: 10 }}>✕</button>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', color: '#e141ec', textAlign: 'center', fontFamily: '"Inter", sans-serif' }}>{t('notifications')}</h2>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <button onClick={() => setNotifTab('received')} style={tabStyle('received', notifTab)}>{t('received_applications')}</button>
              <button onClick={() => setNotifTab('sent')} style={tabStyle('sent', notifTab)}>{t('sent_invitations')}</button>
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
              ) : (
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
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scan & Hire Modal */}
      {showScanModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100
        }}>
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
              onClick={() => { setShowScanModal(false); setScanResult(null); setScanError(''); setScanUid(''); }}
              style={{
                position: 'absolute', top: '15px', right: '15px',
                background: 'transparent', border: 'none', color: '#fff',
                fontSize: '1.2rem', cursor: 'pointer', zIndex: 10
              }}
            >
              ✕
            </button>

            <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', color: '#e141ec', textAlign: 'center' }}>
              Scan QR / Enter UID
            </h2>

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
                {isScanning ? 'Scanning...' : 'Verify Worker'}
              </button>
            </form>

            {scanError && (
              <div style={{
                marginTop: '15px',
                padding: '15px',
                background: 'rgba(255, 50, 50, 0.1)',
                border: '1px solid rgba(255, 50, 50, 0.3)',
                borderRadius: '8px',
                color: '#ff6b6b',
                textAlign: 'center',
                fontWeight: '500'
              }}>
                {scanError}
              </div>
            )}

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
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '8px',
                  color: '#00e676',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  marginBottom: '10px'
                }}>
                  ✓ Verified Worker Match
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                  <span style={{ color: '#888' }}>Name</span>
                  <span style={{ fontWeight: '500', color: '#fff' }}>{scanResult.name || scanResult.displayName || 'N/A'}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                  <span style={{ color: '#888' }}>Role</span>
                  <span style={{ fontWeight: '500', color: '#e141ec' }}>{scanResult.role || 'Worker'}</span>
                </div>

                <button style={{
                  marginTop: '10px',
                  background: '#00e676',
                  color: '#000',
                  border: 'none',
                  padding: '10px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}>
                  Initiate Hire
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default HirerDashboard;
