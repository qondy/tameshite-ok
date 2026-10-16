import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// NOTE: Firebase の Web 設定は秘匿情報ではなく、実質的な防御は firestore.rules 側で行う。
// （他のミニアプリと同様に、この値はコミットして良い）
const firebaseConfig = {
  apiKey: 'AIzaSyDOhe6UJTL4OeArLfw-csbZmHQHBCLCr6Q',
  authDomain: 'tameshite-ok.firebaseapp.com',
  projectId: 'tameshite-ok',
  storageBucket: 'tameshite-ok.firebasestorage.app',
  messagingSenderId: '43118790733',
  appId: '1:43118790733:web:52efe3b414ae4ffa63f404',
};

export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
