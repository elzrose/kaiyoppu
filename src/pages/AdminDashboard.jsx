import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';

const ADMIN_EMAILS = ['admin@kaiyoppu.in'];

const AdminDashboard = () => {
  const { t } = useTranslation();
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const [usersList, setUsersList] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalWorkers: 0, totalHirers: 0, verifiedWorkers: 0 });
  
  // Mobile Menu State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Access Control
    if (!currentUser || !ADMIN_EMAILS.includes(currentUser.email)) {
      navigate('/');
    }
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

      // Fetch logs
      const q = query(collection(db, 'adminLogs'), orderBy('timestamp', 'desc'), limit(10));
      const logsSnap = await getDocs(q);
      setLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser && ADMIN_EMAILS.includes(currentUser.email)) {
      fetchData();
    }
  }, [currentUser]);

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
      fetchLogs();
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
      fetchLogs();
    } catch (error) {
      console.error(error);
      alert("Failed to reject user.");
    }
  };

  const handleAddRemark = async (user) => {
    const remark = prompt("Add official admin remark (e.g. criminal cases):");
    if (remark) {
      try {
        await updateDoc(doc(db, 'users', user.id), { adminRemark: remark });
        alert("Remark added successfully.");
        await logAction('REMARK ADDED', user);
        fetchLogs();
      } catch(e) {
        console.error(e);
      }
    }
  };

  const fetchLogs = async () => {
    try {
      const q = query(collection(db, 'adminLogs'), orderBy('timestamp', 'desc'), limit(10));
      const logsSnap = await getDocs(q);
      setLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error(error);
    }
  };

  if (!currentUser || !ADMIN_EMAILS.includes(currentUser.email)) {
    return <div style={{ background: '#0b0b0b', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#ff4c4c' }}>Unauthorized</div>;
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
      {isMobileMenuOpen && (
        <div className="mobile-menu-overlay hide-on-desktop" onClick={() => setIsMobileMenuOpen(false)}></div>
      )}
      {/* Top Navbar */}
      <nav className="dashboard-nav fixed" style={{ position: 'sticky' }}>
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

            <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '30px' }}>
              {/* User Management Table */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(225, 65, 236, 0.2)',
                borderRadius: '16px',
                padding: '25px',
                overflowX: 'auto'
              }}>
                <h3 style={{ margin: '0 0 20px 0', color: '#e141ec', fontSize: '1.4rem' }}>{t('user_management')}</h3>
                <div className="responsive-table-wrapper">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <th style={tableHeaderStyle}>Name</th>
                      <th style={tableHeaderStyle}>Email</th>
                      <th style={tableHeaderStyle}>Role</th>
                      <th style={tableHeaderStyle}>Status</th>
                      <th style={tableHeaderStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.map(user => (
                      <tr key={user.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={tableCellStyle}>{user.name || 'Unnamed'}</td>
                        <td style={tableCellStyle}>{user.email}</td>
                        <td style={tableCellStyle}>
                          <span style={{
                            padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold',
                            background: user.role === 'Worker' ? 'rgba(225, 65, 236, 0.1)' : 'rgba(0, 230, 118, 0.1)',
                            color: user.role === 'Worker' ? '#e141ec' : '#00e676'
                          }}>
                            {user.role || 'Unassigned'}
                          </span>
                        </td>
                        <td style={tableCellStyle}>
                          {user.isVerified ? (
                            <span style={{ color: '#00e676', fontWeight: 'bold' }}>✓ Verified</span>
                          ) : (
                            <span style={{ color: '#ffb300' }}>Pending</span>
                          )}
                        </td>
                        <td style={tableCellStyle}>
                          {(user.role?.toLowerCase() === 'worker' || user.role?.toLowerCase() === 'hirer') ? (
                            <div style={{ display: 'flex', gap: '10px' }}>
                              <button 
                                onClick={() => handleVerify(user)}
                                disabled={user.isVerified}
                                style={user.isVerified ? disabledBtnStyle : verifyBtnStyle}
                              >
                                {t('verify')}
                              </button>
                              <button 
                                onClick={() => handleReject(user)}
                                style={rejectBtnStyle}
                              >
                                {t('reject')}
                              </button>
                              <button 
                                onClick={() => handleAddRemark(user)}
                                style={remarkBtnStyle}
                              >
                                {t('remark')}
                              </button>
                            </div>
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

              {/* Activity Logs Sidebar */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '25px',
                height: 'fit-content'
              }}>
                <h3 style={{ margin: '0 0 20px 0', color: '#fff', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  Activity Logs
                </h3>
                
                {logs.length === 0 ? (
                  <p style={{ color: '#888', fontStyle: 'italic' }}>No recent activity.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {logs.map(log => (
                      <div key={log.id} style={{
                        padding: '12px',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '8px',
                        borderLeft: `3px solid ${log.action === 'VERIFIED' ? '#00e676' : '#ff4c4c'}`
                      }}>
                        <div style={{ fontSize: '0.85rem', color: '#b0b0b0', marginBottom: '4px' }}>
                          {log.timestamp ? log.timestamp.toDate().toLocaleString() : 'Just now'}
                        </div>
                        <div style={{ fontSize: '0.95rem', color: '#fff' }}>
                          <span style={{ color: log.action === 'VERIFIED' ? '#00e676' : '#ff4c4c', fontWeight: 'bold' }}>{log.action}</span>: {log.targetName}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>by {log.adminEmail}</div>
                      </div>
                    ))}
                  </div>
                )}
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
  letterSpacing: '1px'
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
