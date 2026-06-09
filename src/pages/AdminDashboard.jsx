import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';

export const ADMIN_EMAILS = ['admin@kaiyoppu.com', 'admin@kaiyoppu.in', 'admin123@kaiyoppu.com'];

const AdminDashboard = () => {
  const { t } = useTranslation();
  const { currentUser, userRole, logout } = useAuth();
  const navigate = useNavigate();

  const [usersList, setUsersList] = useState([]);
  const [reportsList, setReportsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalWorkers: 0, totalHirers: 0, verifiedWorkers: 0 });
  
  // Mobile Menu State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isAdmin = currentUser && (ADMIN_EMAILS.includes(currentUser.email) || userRole === 'admin');

  // Candidate Search & Filter State
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState('all'); // 'all' | 'worker' | 'hirer'

  const filteredUsers = usersList.filter(user => {
    const matchesSearch = 
      (user.name || '').toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      (user.email || '').toLowerCase().includes(userSearchQuery.toLowerCase());
    
    if (userTypeFilter === 'all') return matchesSearch;
    return matchesSearch && (user.role || '').toLowerCase() === userTypeFilter;
  });

  useEffect(() => {
    // We do not auto-redirect on unauthorized here anymore.
    // Instead we rely on the component returning the Unauthorized UI below,
    // which has a "Sign Out" button so the user doesn't get stuck.
  }, [currentUser, navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch users
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersData = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      let wCount = 0;
      let hCount = 0;
      let vwCount = 0;
      
      usersData.forEach(u => {
        if (u.role?.toLowerCase() === 'worker') {
          wCount++;
          if (u.isVerified) vwCount++;
        } else if (u.role?.toLowerCase() === 'hirer') {
          hCount++;
        }
      });
      
      setUsersList(usersData);
      setStats({
        totalWorkers: wCount,
        totalHirers: hCount,
        verifiedWorkers: vwCount
      });

      // Fetch mismatch reports
      try {
        const reportsSnap = await getDocs(collection(db, 'mismatchReports'));
        const reportsData = reportsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        reportsData.sort((a, b) => {
          const timeA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
          const timeB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
          return timeB - timeA;
        });
        setReportsList(reportsData);
      } catch (reportsErr) {
        console.error("Error fetching mismatch reports:", reportsErr);
      }

      // Logs fetching removed
    } catch (error) {
      console.error("Error fetching data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser && isAdmin) {
      fetchData();
    }
  }, [currentUser, isAdmin]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error("Failed to log out", error);
    }
  };

  const logAction = async (action, targetUser) => {
    try {
      await addDoc(collection(db, 'adminLogs'), {
        action,
        targetUid: targetUser.id,
        targetName: targetUser.name || targetUser.email,
        adminEmail: currentUser.email,
        timestamp: serverTimestamp()
      });
    } catch(e) {
      console.error("Log error", e);
    }
  };

  const handleVerify = async (user) => {
    try {
      await updateDoc(doc(db, 'users', user.id), { isVerified: true, adminRemark: 'No criminal records found. Cleared for work.' });
      setUsersList(prev => prev.map(u => u.id === user.id ? { ...u, isVerified: true } : u));
      if (!user.isVerified && user.role?.toLowerCase() === 'worker') {
        setStats(prev => ({ ...prev, verifiedWorkers: prev.verifiedWorkers + 1 }));
      }
      await logAction('VERIFIED', user);
    } catch (error) {
      console.error(error);
      alert("Failed to verify user.");
    }
  };

  const handleReject = async (user) => {
    try {
      const remark = prompt("Provide reason/criminal cases if any:");
      if (remark === null) return;
      
      const finalRemark = remark ? `Rejected by Admin. Reason: ${remark}` : 'Rejected by Admin. Background check failed.';
      await updateDoc(doc(db, 'users', user.id), { isVerified: false, adminRemark: finalRemark });
      setUsersList(prev => prev.map(u => u.id === user.id ? { ...u, isVerified: false } : u));
      if (user.isVerified && user.role?.toLowerCase() === 'worker') {
        setStats(prev => ({ ...prev, verifiedWorkers: prev.verifiedWorkers - 1 }));
      }
      await logAction('REJECTED', user);
    } catch (error) {
      console.error(error);
      alert("Failed to reject user.");
    }
  };

  const handleAddRemark = async (user) => {
    const remark = prompt("Add official admin remark (e.g. criminal cases):", user.adminRemark || "");
    if (remark !== null) {
      try {
        await updateDoc(doc(db, 'users', user.id), { adminRemark: remark });
        setUsersList(prev => prev.map(u => u.id === user.id ? { ...u, adminRemark: remark } : u));
        alert("Remark updated successfully.");
        await logAction('REMARK ADDED', user);
      } catch(e) {
        console.error(e);
      }
    }
  };

  const handleResetVerification = async (report) => {
    try {
      const confirmAction = window.confirm(`Are you sure you want to reset verification for ${report.workerName}? This will lock their QR code and clear their profile photo.`);
      if (!confirmAction) return;

      const workerRef = doc(db, 'users', report.workerId);
      await updateDoc(workerRef, {
        isVerified: false,
        profilePic: '',
        aadhaarNumber: '',
        lastVerifiedAt: ''
      });

      const reportRef = doc(db, 'mismatchReports', report.id);
      await updateDoc(reportRef, {
        status: 'resolved',
        actionTaken: 'reset_verification'
      });

      await logAction('RESET_VERIFICATION', { id: report.workerId, name: report.workerName });
      alert("Worker verification reset successfully.");
      await fetchData();
    } catch (err) {
      console.error("Error resetting verification:", err);
      alert("Failed to reset verification.");
    }
  };

  const handleSuspendWorker = async (report) => {
    try {
      const confirmAction = window.confirm(`Are you sure you want to suspend ${report.workerName}? They will be blocked from accessing the application.`);
      if (!confirmAction) return;

      const workerRef = doc(db, 'users', report.workerId);
      await updateDoc(workerRef, {
        isSuspended: true,
        status: 'suspended'
      });

      const reportRef = doc(db, 'mismatchReports', report.id);
      await updateDoc(reportRef, {
        status: 'resolved',
        actionTaken: 'suspended'
      });

      await logAction('SUSPENDED_WORKER', { id: report.workerId, name: report.workerName });
      alert("Worker suspended successfully.");
      await fetchData();
    } catch (err) {
      console.error("Error suspending worker:", err);
      alert("Failed to suspend worker.");
    }
  };

  const handleDismissReport = async (report) => {
    try {
      const confirmAction = window.confirm("Are you sure you want to dismiss this report? No changes will be made to the worker.");
      if (!confirmAction) return;

      const reportRef = doc(db, 'mismatchReports', report.id);
      await updateDoc(reportRef, {
        status: 'resolved',
        actionTaken: 'dismissed'
      });

      await logAction('DISMISSED_REPORT', { id: report.workerId, name: report.workerName });
      alert("Report dismissed.");
      await fetchData();
    } catch (err) {
      console.error("Error dismissing report:", err);
      alert("Failed to dismiss report.");
    }
  };



  if (!currentUser || !isAdmin) {
    return (
      <div style={{ background: '#0b0b0b', height: '100vh', display: 'flex', flexDirection: 'column', gap: '20px', justifyContent: 'center', alignItems: 'center', color: '#ff4c4c', fontFamily: '"Inter", sans-serif' }}>
        <h2>Unauthorized Access</h2>
        <p style={{ color: '#fff' }}>You are logged in as <strong>{currentUser?.email || 'Unknown'}</strong>, which is not an admin.</p>
        <button 
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          style={{
            background: 'transparent',
            border: '1px solid #ff4c4c',
            color: '#ff4c4c',
            padding: '10px 20px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Sign Out & Switch Account
        </button>
      </div>
    );
  }

  return (
    <div style={{
      width: '100vw',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
      color: '#fff',
      fontFamily: '"Advent Pro", "Inter", sans-serif',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box'
    }}>
      {/* Top Navbar */}
      <nav className="dashboard-nav fixed" style={{ position: 'sticky' }}>
        {isMobileMenuOpen && (
          <div className="mobile-menu-overlay hide-on-desktop" onClick={() => setIsMobileMenuOpen(false)}></div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <h2 style={{
            margin: 0,
            fontSize: '1.8rem',
            fontWeight: 'bold',
            color: '#fff',
            letterSpacing: '2px',
            textShadow: '0 0 10px rgba(225, 65, 236, 0.5)'
          }}>
            {t('app_name')} <span style={{ color: '#e141ec' }}>ADMIN</span>
          </h2>
        </div>
        <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          ☰
        </button>
        <div className={`nav-actions ${isMobileMenuOpen ? 'open' : ''}`}>
          <button className="close-menu-btn hide-on-desktop" onClick={() => setIsMobileMenuOpen(false)}>✕</button>
          <LanguageSwitcher />
        <button
          onClick={handleLogout}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255, 76, 76, 0.5)',
            color: '#ff4c4c',
            padding: '8px 20px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'all 0.3s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 76, 76, 0.1)';
            e.currentTarget.style.boxShadow = '0 0 10px rgba(255, 76, 76, 0.3)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          {t('sign_out')}
        </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <div style={{ padding: '40px', maxWidth: '1400px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        
        {loading ? (
          <div style={{ textAlign: 'center', color: '#e141ec', marginTop: '50px', fontSize: '1.2rem' }}>Loading Admin Data...</div>
        ) : (
          <>
            {/* Stats Section */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '20px',
              marginBottom: '40px'
            }}>
              <div style={statCardStyle}>
                <div style={statLabelStyle}>{t('total_workers')}</div>
                <div style={statValueStyle}>{stats.totalWorkers}</div>
              </div>
              <div style={statCardStyle}>
                <div style={statLabelStyle}>{t('total_hirers')}</div>
                <div style={statValueStyle}>{stats.totalHirers}</div>
              </div>
              <div style={statCardStyle}>
                <div style={statLabelStyle}>{t('verified_workers')}</div>
                <div style={statValueStyle}>{stats.verifiedWorkers}</div>
              </div>
            </div>

            {/* Mismatch Reports Panel */}
            <div style={{
              background: 'rgba(255, 76, 76, 0.02)',
              border: '1px solid rgba(255, 76, 76, 0.25)',
              borderRadius: '16px',
              padding: '25px',
              marginBottom: '40px',
              boxShadow: '0 4px 30px rgba(255, 76, 76, 0.05)'
            }}>
              <h3 style={{ margin: '0 0 20px 0', color: '#ff4c4c', fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.6rem' }}>🚨</span> Selfie Mismatch Reports
              </h3>

              {reportsList.length === 0 ? (
                <div style={{ color: '#aaa', fontStyle: 'italic', padding: '10px' }}>No profile mismatch reports recorded.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                  {reportsList.map(report => (
                    <div key={report.id} style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: `1px solid ${report.status === 'pending' ? 'rgba(255, 76, 76, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                      borderRadius: '12px',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        {/* Worker Verified Selfie Display */}
                        <div style={{
                          width: '70px', height: '70px', borderRadius: '50%', overflow: 'hidden',
                          border: '2px solid #ff4c4c', background: 'rgba(255,255,255,0.05)'
                        }}>
                          {report.workerPhoto ? (
                            <img src={report.workerPhoto} alt="Worker Selfie" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '2rem' }}>👤</div>
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>{report.workerName}</h4>
                          <span style={{ fontSize: '0.8rem', color: '#aaa' }}>{report.workerEmail}</span>
                          <div style={{ marginTop: '5px' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold',
                              background: report.status === 'pending' ? 'rgba(255, 76, 76, 0.2)' : 'rgba(0, 230, 118, 0.2)',
                              color: report.status === 'pending' ? '#ff4c4c' : '#00e676'
                            }}>
                              {report.status === 'pending' ? 'Pending Action' : 'Resolved'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ color: '#888' }}>Reported by:</span>
                          <span style={{ color: '#fff', fontWeight: '500' }}>{report.reportedByName}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ color: '#888' }}>Hirer email:</span>
                          <span style={{ color: '#aaa' }}>{report.reportedByEmail}</span>
                        </div>
                        <div style={{ background: 'rgba(255, 76, 76, 0.05)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255, 76, 76, 0.15)', color: '#ffb3b3', fontStyle: 'italic' }}>
                          "{report.comment}"
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '8px', textAlign: 'right' }}>
                          {report.timestamp?.toDate ? report.timestamp.toDate().toLocaleString() : new Date(report.timestamp || 0).toLocaleString()}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px', marginTop: 'auto' }}>
                        {report.status === 'pending' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button 
                                onClick={() => handleResetVerification(report)}
                                style={{ flex: 1, padding: '8px', background: '#ffa000', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}
                              >
                                Reset Verify
                              </button>
                              <button 
                                onClick={() => handleSuspendWorker(report)}
                                style={{ flex: 1, padding: '8px', background: '#ff4c4c', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}
                              >
                                Suspend
                              </button>
                            </div>
                            <button 
                              onClick={() => handleDismissReport(report)}
                              style={{ width: '100%', padding: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#ccc', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}
                            >
                              Dismiss Report
                            </button>
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#00e676', fontWeight: 'bold', padding: '6px 0', background: 'rgba(0, 230, 118, 0.05)', borderRadius: '6px' }}>
                            ✓ Resolved ({report.actionTaken?.replace('_', ' ').toUpperCase()})
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>
              {/* User Management Table */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(225, 65, 236, 0.2)',
                borderRadius: '16px',
                padding: '25px',
                overflowX: 'auto'
              }}>
                <h3 style={{ margin: '0 0 20px 0', color: '#e141ec', fontSize: '1.4rem' }}>{t('user_management')}</h3>

                {/* Search & Filters */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '15px',
                  marginBottom: '20px',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  {/* Search input */}
                  <input
                    type="text"
                    placeholder="Search candidate by name or email..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(225, 65, 236, 0.3)',
                      borderRadius: '8px',
                      padding: '10px 15px',
                      color: '#fff',
                      fontSize: '0.9rem',
                      fontFamily: '"Inter", sans-serif',
                      minWidth: '260px',
                      outline: 'none',
                      transition: 'border-color 0.3s',
                    }}
                  />

                  {/* Filter tabs */}
                  <div style={{
                    display: 'flex',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '4px'
                  }}>
                    {['all', 'worker', 'hirer'].map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setUserTypeFilter(filter)}
                        style={{
                          background: userTypeFilter === filter ? 'rgba(225, 65, 236, 0.25)' : 'transparent',
                          color: userTypeFilter === filter ? '#fff' : '#a0a0a0',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '0.85rem',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          transition: 'all 0.3s ease',
                          textTransform: 'capitalize'
                        }}
                      >
                        {filter === 'all' ? 'All Users' : filter === 'worker' ? 'Workers' : 'Hirers'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="responsive-table-wrapper">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <th style={tableHeaderStyle}>Name</th>
                      <th style={tableHeaderStyle}>Email</th>
                      <th style={tableHeaderStyle}>Role</th>
                      <th style={tableHeaderStyle}>CCTNS / Verification Status</th>
                      <th style={tableHeaderStyle}>Admin Remark</th>
                      <th style={tableHeaderStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(user => (
                      <tr key={user.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={tableCellStyle}>{user.name || 'Unnamed'}</td>
                        <td style={tableCellStyle}>{user.email}</td>
                        <td style={tableCellStyle}>
                          <span style={{
                            padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold',
                            background: (user.role || '').toLowerCase() === 'worker' ? 'rgba(225, 65, 236, 0.1)' : 'rgba(0, 230, 118, 0.1)',
                            color: (user.role || '').toLowerCase() === 'worker' ? '#e141ec' : '#00e676'
                          }}>
                            {user.role || 'Unassigned'}
                          </span>
                        </td>
                        <td style={tableCellStyle}>
                          {user.verificationStatus === 'blocked' ? (
                            <span style={{ color: '#ff4c4c', fontWeight: 'bold', background: 'rgba(255,76,76,0.1)', padding: '3px 8px', borderRadius: '6px' }}>🚨 Blocked</span>
                          ) : user.verificationStatus === 'on_review' ? (
                            <span style={{ color: '#ff9800', fontWeight: 'bold', background: 'rgba(255,152,0,0.1)', padding: '3px 8px', borderRadius: '6px' }}>⚠ On Review</span>
                          ) : user.verificationStatus === 'verified' || user.isVerified ? (
                            <span style={{ color: '#00e676', fontWeight: 'bold', background: 'rgba(0,230,118,0.1)', padding: '3px 8px', borderRadius: '6px' }}>✓ Verified</span>
                          ) : (
                            <span style={{ color: '#a0a0a0', fontStyle: 'italic' }}>Unverified</span>
                          )}
                        </td>
                        <td style={{ ...tableCellStyle, maxWidth: '200px', wordBreak: 'break-word' }}>
                          {user.adminRemark ? (
                            <span style={{ color: '#ff70ca', fontStyle: 'italic' }}>"{user.adminRemark}"</span>
                          ) : user.cctnsRemark ? (
                            <span style={{ color: '#a0a0a0', fontStyle: 'italic' }}>"{user.cctnsRemark}"</span>
                          ) : (
                            <span style={{ color: '#555', fontStyle: 'italic' }}>No remarks</span>
                          )}
                        </td>
                        <td style={tableCellStyle}>
                          {(user.role?.toLowerCase() === 'worker' || user.role?.toLowerCase() === 'hirer') ? (
                            <button 
                              onClick={() => handleAddRemark(user)}
                              style={remarkBtnStyle}
                            >
                              {t('remark')}
                            </button>
                          ) : (
                            <span style={{ color: '#555', fontStyle: 'italic' }}>N/A</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// --- Styles ---

const statCardStyle = {
  background: 'rgba(225, 65, 236, 0.05)',
  border: '1px solid rgba(225, 65, 236, 0.3)',
  borderRadius: '12px',
  padding: '20px',
  boxShadow: '0 4px 20px rgba(225, 65, 236, 0.1)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center'
};

const statLabelStyle = {
  fontSize: '1.1rem',
  color: '#b0b0b0',
  marginBottom: '10px'
};

const statValueStyle = {
  fontSize: '2.5rem',
  fontWeight: 'bold',
  color: '#e141ec',
  textShadow: '0 0 10px rgba(225, 65, 236, 0.4)'
};

const tableHeaderStyle = {
  padding: '15px 10px',
  color: '#888',
  fontWeight: 'bold',
  fontSize: '0.9rem',
  textTransform: 'uppercase',
  letterSpacing: '1px',
  position: 'sticky',
  top: 0,
  background: '#1c1842', // Matches card background to overlap scrolling items
  zIndex: 2
};

const tableCellStyle = {
  padding: '15px 10px',
  color: '#e0e0e0',
  fontSize: '0.95rem'
};

const verifyBtnStyle = {
  background: '#00e676',
  color: '#000',
  border: 'none',
  padding: '6px 12px',
  borderRadius: '6px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  boxShadow: '0 0 10px rgba(0, 230, 118, 0.3)'
};

const disabledBtnStyle = {
  background: 'rgba(255,255,255,0.1)',
  color: '#555',
  border: 'none',
  padding: '6px 12px',
  borderRadius: '6px',
  fontWeight: 'bold',
  cursor: 'not-allowed'
};

const rejectBtnStyle = {
  background: 'transparent',
  color: '#ff4c4c',
  border: '1px solid #ff4c4c',
  padding: '6px 12px',
  borderRadius: '6px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'all 0.2s ease'
};

const remarkBtnStyle = {
  background: 'transparent',
  color: '#e141ec',
  border: '1px solid rgba(225, 65, 236, 0.5)',
  padding: '6px 12px',
  borderRadius: '6px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'all 0.2s ease'
};

export default AdminDashboard;
