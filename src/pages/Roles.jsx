import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';

const Roles = () => {
  const navigate = useNavigate();
  const { currentUser, userRole, setUserRole, logout } = useAuth();
  const { t } = useTranslation();
  
  useEffect(() => {
    if (currentUser && currentUser.email === 'admin@kaiyoppu.com') {
      navigate('/admin');
    } else if (userRole && ['worker', 'hirer', 'admin'].includes(userRole)) {
      navigate(`/${userRole}`);
    }
  }, [userRole, currentUser, navigate]);

  const roles = [
    { id: 'worker', name: t('role_worker'), desc: t('role_worker_desc') },
    { id: 'hirer', name: t('role_hirer'), desc: t('role_hirer_desc') },
    { id: 'admin', name: 'Administrator', desc: 'Manage platform settings' }
  ];

  const handleRoleSelection = async (roleObj) => {
    try {
      if (currentUser) {
        // Commit role to Firestore using the currently authed user's ID
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          role: roleObj.id
        });
        
        // Update application state
        setUserRole(roleObj.id);
        navigate(`/${roleObj.id}`);
      } else {
        // Fallback for an unauthenticated guest bypass 
        navigate(`/${roleObj.id}`);
      }
    } catch (error) {
      console.error("Failed to assign role to User Document:", error);
    }
  };

  const handleGoBack = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: '"Advent Pro", "Inter", sans-serif',
      margin: 0,
      position: 'relative'
    }}>
      <nav className="dashboard-nav" style={{ position: 'absolute', padding: '15px' }}>
        <div></div>
        <div className="nav-actions">
          <LanguageSwitcher />
        </div>
      </nav>
      <h1 style={{ 
        color: '#e141ec', 
        fontSize: '3rem',
        textShadow: '0 0 15px rgba(225, 65, 236, 0.4)',
        marginBottom: '10px',
        fontOpticalSizing: 'auto'
      }}>{t('roles_title')}</h1>
      <p style={{ color: '#d0d0d0', marginBottom: '40px', letterSpacing: '2px', fontFamily: '"Inter", sans-serif' }}>{t('roles_desc')}</p>
      
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        width: '100%',
        maxWidth: '350px'
      }}>
        {roles.map(role => (
          <button 
            key={role.id}
            onClick={() => handleRoleSelection(role)}
            style={{
              padding: '15px 24px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(225, 65, 236, 0.3)',
              color: '#fff',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              fontSize: '1.2rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              backdropFilter: 'blur(5px)',
              fontFamily: '"Inter", sans-serif'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(225, 65, 236, 0.1)';
              e.currentTarget.style.borderColor = '#e141ec';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(225, 65, 236, 0.3)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(225, 65, 236, 0.3)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span style={{ fontWeight: 'bold', marginBottom: '5px' }}>{role.name}</span>
            <span style={{ fontSize: '0.85rem', color: '#b0b0b0' }}>{role.desc}</span>
          </button>
        ))}
      </div>

      <button 
        onClick={handleGoBack}
        style={{
          marginTop: '40px',
          padding: '10px 20px',
          background: 'transparent',
          border: 'none',
          color: '#a0a0a0',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          fontSize: '0.9rem',
          fontFamily: '"Inter", sans-serif',
          textDecoration: 'underline'
        }}
        onMouseOver={(e) => e.currentTarget.style.color = '#fff'}
        onMouseOut={(e) => e.currentTarget.style.color = '#a0a0a0'}
      >
        Back to Login
      </button>
    </div>
  );
};

export default Roles;
