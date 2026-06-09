import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, googleProvider } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, addDoc } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);

  const loginWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if the user document already exists in Firestore
    const userDocRef = doc(db, 'users', user.uid);
    const userDocSnap = await getDoc(userDocRef);
    
    if (!userDocSnap.exists()) {
      // Create new user document
      await setDoc(userDocRef, {
        uid: user.uid,
        name: user.displayName,
        email: user.email,
        role: null,
        createdAt: new Date().toISOString()
      });
    } else {
      setUserRole(userDocSnap.data().role || null);
    }
  };

  const signupWithEmail = async (email, password) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;
    
    // Create new user document securely
    const userDocRef = doc(db, 'users', user.uid);
    await setDoc(userDocRef, {
      uid: user.uid,
      name: email.split('@')[0], // Placeholder name from email
      email: user.email,
      role: null,
      createdAt: new Date().toISOString()
    });
    
    return user;
  };

  const loginWithEmail = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const user = result.user;
    
    // Check if the user document already exists in Firestore to pull role
    const userDocRef = doc(db, 'users', user.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      setUserRole(userDocSnap.data().role || null);
    }
    
    return user;
  };

  const logout = () => {
    return signOut(auth);
  };

  useEffect(() => {
    const seedCctnsDb = async () => {
      try {
        const cctnsRef = collection(db, 'cctnsDb');
        const snap = await getDocs(cctnsRef);
        if (snap.empty) {
          const mockRecords = [
            { name: 'Amit Kumar', aadhaarNumber: '111122223333', type: 'wanted', offense: 'Theft & Assault (Wanted by Police)' },
            { name: 'Raju wanted', aadhaarNumber: '123412341234', type: 'wanted', offense: 'Robbery & Fraud (Wanted by Police)' },
            { name: 'Gopi review', aadhaarNumber: '567856785678', type: 'fir', offense: 'FIR No. 204/2026: Property Dispute (Under Police Review)' },
            { name: 'FIR pending', aadhaarNumber: '888888888888', type: 'fir', offense: 'FIR No. 102/2025: Traffic Offense (Under Police Review)' },
          ];
          for (const record of mockRecords) {
            await addDoc(cctnsRef, record);
          }
          console.log("CCTNS database successfully seeded with mock criminal profiles.");
        }
      } catch (e) {
        console.warn("Failed to seed CCTNS DB:", e);
      }
    };
    seedCctnsDb();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Fetch role if user exists upon page load
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            setUserRole(userDocSnap.data().role || null);
          } else {
            setUserRole(null);
          }
        } catch (error) {
          console.error("Failed to fetch user role from DB:", error);
          alert(`Database Error: ${error.message}\nMake sure your Firestore Database is created and permissions are allowed.`);
          setUserRole(null);
        }
        setCurrentUser(user);
      } else {
        setUserRole(null);
        setCurrentUser(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userRole,
    setUserRole,
    loginWithGoogle,
    signupWithEmail,
    loginWithEmail,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
