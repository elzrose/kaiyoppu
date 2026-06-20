import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { ADMIN_EMAILS } from './AdminDashboard';
import './Login.css';

const Login = () => {
  const { t } = useTranslation();
  
  // Login Method State
  const [loginMethod, setLoginMethod] = useState('phone'); // 'phone' | 'email'
  
  // Phone Auth State
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  
  // Email Auth State
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  
  const [authError, setAuthError] = useState('');
  
  const navigate = useNavigate();
  const { 
    loginWithGoogle, 
    loginWithEmail, 
    signupWithEmail, 
    setupRecaptcha, 
    sendOtp, 
    confirmOtp, 
    loginAnonymously,
    currentUser, 
    userRole 
  } = useAuth();
  
  const recaptchaVerifierRef = useRef(null);

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

  // Clean up reCAPTCHA verifier on unmount
  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch (e) {}
      }
    };
  }, []);

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!phoneNumber) return;
    
    setSendingOtp(true);
    try {
      let formattedPhone = phoneNumber.trim();
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = `+91${formattedPhone}`;
      }

      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = setupRecaptcha('recaptcha-container');
      }

      const appVerifier = recaptchaVerifierRef.current;
      const confirmation = await sendOtp(formattedPhone, appVerifier);
      setConfirmationResult(confirmation);
      setIsOtpSent(true);
    } catch (error) {
      console.error("SMS OTP Send failed:", error);
      setAuthError(error.message);
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch (e) {}
        recaptchaVerifierRef.current = null;
      }
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!otpCode || !confirmationResult) return;

    setVerifyingOtp(true);
    try {
      await confirmOtp(confirmationResult, otpCode.trim());
    } catch (error) {
      console.error("OTP Verification failed:", error);
      setAuthError("Invalid verification code. Please check the code and try again.");
    } finally {
      setVerifyingOtp(false);
    }
  };

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
      } catch (error) {
        setAuthError(error.message);
        console.error("Email auth error:", error);
      }
    }
  };

  const handleGuest = async () => {
    try {
      await loginAnonymously();
    } catch (error) {
      console.error("Anonymous authentication failed:", error);
      if (error.code === 'auth/operation-not-allowed') {
        alert("Anonymous sign-in is not enabled in your Firebase Console. Please enable the 'Anonymous' provider under Authentication > Sign-in method.");
      } else {
        alert(`Failed to sign in as guest: ${error.message}`);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await loginWithGoogle();
    } catch (error) {
      if (error.code === 'auth/popup-closed-by-user') {
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
        
        {/* Toggle Login Method tabs */}
        <div style={{
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          padding: '4px',
          marginBottom: '25px',
          gap: '4px'
        }}>
          <button
            type="button"
            onClick={() => {
              setLoginMethod('phone');
              setAuthError('');
            }}
            style={{
              flex: 1,
              background: loginMethod === 'phone' ? 'rgba(225, 65, 236, 0.25)' : 'transparent',
              color: loginMethod === 'phone' ? '#fff' : '#a0a0a0',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 12px',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
             {t('use_phone_login')}
          </button>
          <button
            type="button"
            onClick={() => {
              setLoginMethod('email');
              setAuthError('');
            }}
            style={{
              flex: 1,
              background: loginMethod === 'email' ? 'rgba(225, 65, 236, 0.25)' : 'transparent',
              color: loginMethod === 'email' ? '#fff' : '#a0a0a0',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 12px',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
             {t('use_email_login')}
          </button>
        </div>

        {authError && <div style={{ color: '#ff4c4c', marginBottom: '15px', fontSize: '0.85rem', textAlign: 'center' }}>{authError}</div>}

        {loginMethod === 'phone' ? (
          <form onSubmit={isOtpSent ? handleVerifyOtp : handleSendOtp} className="login-form">
            {/* Invisible Recaptcha Container required by Firebase */}
            <div id="recaptcha-container"></div>

            <div className="input-group">
              <input 
                type="tel" 
                required 
                disabled={isOtpSent || sendingOtp}
                value={phoneNumber} 
                onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d+]/g, ''))} 
                placeholder="+91 98765 43210"
                style={{ letterSpacing: '1px' }}
              />
              <label className="active">{t('phone_label')}</label>
            </div>

            {isOtpSent && (
              <div className="input-group animate-fade-in">
                <input 
                  type="text" 
                  required 
                  maxLength="6"
                  disabled={verifyingOtp}
                  value={otpCode} 
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))} 
                  placeholder="123456"
                  style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '1.2rem' }}
                />
                <label className="active">{t('otp_label')}</label>
              </div>
            )}

            <button type="submit" disabled={sendingOtp || verifyingOtp} className="login-btn">
              {verifyingOtp ? 'Verifying...' : sendingOtp ? 'Sending...' : isOtpSent ? t('verify_otp') : t('send_otp')}
            </button>

            {isOtpSent && (
              <div style={{ textAlign: 'center', marginTop: '15px', fontSize: '0.85rem' }}>
                <span 
                  onClick={() => { setIsOtpSent(false); setOtpCode(''); setConfirmationResult(null); }} 
                  style={{ color: '#e141ec', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  ← Change Number
                </span>
              </div>
            )}
          </form>
        ) : (
          <form onSubmit={handleEmailAuth} className="login-form">
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
        )}

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
