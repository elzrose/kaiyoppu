import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { ADMIN_EMAILS } from './AdminDashboard';
import './Login.css';

const Login = () => {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authError, setAuthError] = useState('');
  
  const navigate = useNavigate();
  const { loginWithGoogle, loginWithEmail, signupWithEmail, currentUser, userRole } = useAuth();

  // On mount or state change, intercept if they are already logged in
  useEffect(() => {
    if (currentUser) {
      if (ADMIN_EMAILS.includes(currentUser.email)) {
        navigate('/admin');
      } else if (userRole && ['worker', 'hirer', 'admin'].includes(userRole)) {
        navigate(`/${userRole}`);
      } else {
        navigate('/roles');
      }
    }
  }, [currentUser, userRole, navigate]);

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (identifier && password) {
      try {
        if (isLoginMode) {
          await loginWithEmail(identifier, password);
        } else {
          await signupWithEmail(identifier, password);
        }
        // Redirect logic is safely handled by useEffect above tracking currentUser
      } catch (error) {
        setAuthError(error.message);
        console.error("Email auth error:", error);
      }
    }
  };

  const handleGuest = () => {
    navigate('/roles');
  };

  const handleGoogleSignIn = async () => {
    try {
      await loginWithGoogle();
      // the useEffect above will redirect them automatically
    } catch (error) {
      if (error.code === 'auth/popup-closed-by-user') {
        // Silently ignore if the user simply closes the login window
        console.log("User canceled the Google Sign In popup.");
      } else {
        console.error("Failed to sign in with Google:", error);
        alert(`Firebase Error: ${error.message}\n\nPlease check the console for more details.`);
      }
    }
  };

  return (
    <div className="login-container">
      <div style={{ position: 'absolute', top: '20px', right: '30px', zIndex: 10 }}>
        <LanguageSwitcher />
      </div>
      <div className="login-card">
        <div className="login-header">
          <h1>{t('app_name')}</h1>
          <p>{t('tagline')}</p>
        </div>
        
        <form onSubmit={handleEmailAuth} className="login-form">
          {authError && <div style={{ color: '#ff4c4c', marginBottom: '15px', fontSize: '0.85rem', textAlign: 'center' }}>{authError}</div>}
          <div className="input-group">
            <input 
              type="email" 
              required 
              value={identifier} 
              onChange={(e) => setIdentifier(e.target.value)} 
            />
            <label>{t('email_label')}</label>
          </div>
          
          <div className="input-group">
            <input 
              type="password" 
              required 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
            />
            <label>{t('password_label')}</label>
          </div>

          <button type="submit" className="login-btn">
            {isLoginMode ? t('login_btn') : t('signup_btn')}
          </button>
          
          <div style={{ textAlign: 'center', marginTop: '15px', fontSize: '0.9rem', color: '#b0b0b0' }}>
            {isLoginMode ? t('no_account') : t('has_account')}
            <span 
              onClick={() => { setIsLoginMode(!isLoginMode); setAuthError(''); }} 
              style={{ color: '#e141ec', cursor: 'pointer', fontWeight: 'bold' }}
            >
              {isLoginMode ? t('signup_btn') : t('login_btn')}
            </span>
          </div>
        </form>

        <div className="divider">
          <span>{t('or')}</span>
        </div>

        <div className="social-opts">
          <button type="button" onClick={handleGoogleSignIn} className="google-btn">
            <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {t('continue_google')}
          </button>

          <button type="button" onClick={handleGuest} className="guest-btn">
            {t('continue_guest')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
