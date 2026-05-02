// Import Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, connectFirestoreEmulator, collection, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, query, where, serverTimestamp, onSnapshot, orderBy, increment, limit as firestoreLimit } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-storage.js";
import { getAuth, signInWithPhoneNumber, RecaptchaVerifier, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-functions.js";

// Your Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB8F8597CmK4qhuc2XTisMvcA5Zsec18ek",
    authDomain: "tempocal.app",
    projectId: "bandcal-89c81",
    storageBucket: "bandcal-89c81.firebasestorage.app",
    messagingSenderId: "935794339262",
    appId: "1:935794339262:web:5afec7a960aa6aba9dddef",
    measurementId: "G-7QVCCK2DX5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const functions = getFunctions(app, 'us-central1');
// Phone auth state
let phoneConfirmationResult = null;

// Connect to emulators when running locally
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
if (isLocalhost) {
    console.log('🔧 Running locally - connecting to Firebase emulators');
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    window.FUNCTIONS_EMULATOR_URL = 'http://127.0.0.1:5001/bandcal-89c81/us-central1';
} else {
    window.FUNCTIONS_EMULATOR_URL = null;
}

// Make functions available globally
window.db = db;
window.storage = storage;
window.auth = auth;
window.collection = collection;
window.addDoc = addDoc;
window.doc = doc;
window.getDoc = getDoc;
window.getDocs = getDocs;
window.query = query;
window.where = where;
window.updateDoc = updateDoc;
window.serverTimestamp = serverTimestamp;
window.storageRef = storageRef;
window.uploadBytes = uploadBytes;
window.getDownloadURL = getDownloadURL;
window.functions = functions;
window.httpsCallable = httpsCallable;

// Current user state
window.currentUser = null;

// Restore pending actions from localStorage (for mobile redirect flow)
(function restorePendingActions() {
    const pendingBandJoin = localStorage.getItem('pendingBandJoin');
    if (pendingBandJoin) {
        window.pendingBandJoin = pendingBandJoin;
        localStorage.removeItem('pendingBandJoin');
    }
    const pendingLeaderAccept = localStorage.getItem('pendingLeaderAccept');
    if (pendingLeaderAccept) {
        window.pendingLeaderAccept = pendingLeaderAccept;
        localStorage.removeItem('pendingLeaderAccept');
    }
    const pendingBandInviteId = localStorage.getItem('pendingBandInviteId');
    if (pendingBandInviteId) {
        window.pendingBandInviteId = pendingBandInviteId;
        localStorage.removeItem('pendingBandInviteId');
    }
})();

// Check if mobile device
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Check if running inside Capacitor native shell
function isCapacitorNative() {
    return window.Capacitor && window.Capacitor.isNativePlatform();
}

// Phone auth — public paths that should be reachable without sign-in
function isPublicPath() {
    const path = window.location.pathname;
    return path.startsWith('/b/') || path.startsWith('/e/') ||
           path === '/privacy' || path === '/terms' ||
           path === '/sms' || path === '/sms-signup';
}

// Show the welcome / sign-in gate
window.showWelcomeScreen = function() {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = '';
    });
    const welcome = document.getElementById('screenWelcome');
    if (welcome) {
        welcome.classList.add('active');
        welcome.style.display = 'flex';
    }
    document.body.classList.add('hide-tab-bar');
    const tabBar = document.getElementById('bottomTabBar');
    if (tabBar) tabBar.style.display = 'none';
    // Hide header via class so showGlobalHeader can re-add it later
    const header = document.getElementById('globalHeader');
    if (header) {
        header.classList.remove('visible');
        header.style.display = '';
    }
    document.body.classList.remove('has-header');
};

// Show phone entry screen
window.showPhoneEntry = function() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const entry = document.getElementById('screenPhoneEntry');
    if (entry) entry.classList.add('active');
    const input = document.getElementById('phoneAuthInput');
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 100);
    }
};

// Send SMS verification code
window.sendPhoneCode = async function() {
    const raw = document.getElementById('phoneAuthInput').value.trim();
    const phone = normalizePhoneNumber(raw);
    if (!phone) {
        alert('Please enter a valid US phone number');
        return;
    }

    const btn = document.getElementById('sendCodeBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
        if (!window.recaptchaVerifier) {
            window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                size: 'invisible'
            });
        }
        phoneConfirmationResult = await signInWithPhoneNumber(auth, phone, window.recaptchaVerifier);

        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('screenPhoneVerify').classList.add('active');
        document.getElementById('verifyPhoneDisplay').textContent = formatPhoneDisplay(phone);
        const codeInput = document.getElementById('codeAuthInput');
        codeInput.value = '';
        setTimeout(() => codeInput.focus(), 100);
    } catch (error) {
        console.error('Send code error:', error);
        alert('Could not send code: ' + (error.message || error.code));
        if (window.recaptchaVerifier) {
            try { window.recaptchaVerifier.clear(); } catch (e) {}
            window.recaptchaVerifier = null;
        }
    } finally {
        btn.disabled = false;
        btn.textContent = 'Send code';
    }
};

// Verify the SMS code
window.verifyPhoneCode = async function() {
    const code = document.getElementById('codeAuthInput').value.trim();
    if (!/^\d{6}$/.test(code)) {
        alert('Enter the 6-digit code');
        return;
    }
    if (!phoneConfirmationResult) {
        alert('Session expired. Please try again.');
        showWelcomeScreen();
        return;
    }

    const btn = document.getElementById('verifyCodeBtn');
    btn.disabled = true;
    btn.textContent = 'Verifying...';

    try {
        const result = await phoneConfirmationResult.confirm(code);
        window.currentUser = result.user;
        phoneConfirmationResult = null;
        // onAuthStateChanged handles the rest (profile check, navigation)
    } catch (error) {
        console.error('Verify error:', error);
        alert('Invalid code. Try again.');
        btn.disabled = false;
        btn.textContent = 'Verify';
    }
};

// Resend code (returns to phone entry to start over)
window.resendPhoneCode = function() {
    phoneConfirmationResult = null;
    if (window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch (e) {}
        window.recaptchaVerifier = null;
    }
    showPhoneEntry();
};

// Sign Out
window.signOutUser = async function() {
    try {
        await signOut(auth);
        window.currentUser = null;
        showWelcomeScreen();
    } catch (error) {
        console.error("Sign out error:", error);
    }
};

// Auth state listener
onAuthStateChanged(auth, async (user) => {
    window.currentUser = user;

    if (user) {
        const profile = await checkUserProfile(user);
        window.currentUserProfile = profile;

        // First-time signup → profile setup; signed in on welcome/phone screens → home
        if (!profile) {
            showProfileSetup();
        } else {
            const onAuthScreen =
                document.getElementById('screenWelcome')?.classList.contains('active') ||
                document.getElementById('screenPhoneEntry')?.classList.contains('active') ||
                document.getElementById('screenPhoneVerify')?.classList.contains('active');
            if (onAuthScreen) showHomeScreen();
        }
    } else {
        window.currentUserProfile = null;
        // Logged out — gate all non-public paths behind welcome screen
        if (!isPublicPath()) {
            showWelcomeScreen();
        }
    }

    updateAuthUI(user);
    if (window.updateMenuAuth) updateMenuAuth();

    // If user just signed in via RSVP flow, reload the page
    if (user && window.pendingRsvpReload) {
        window.pendingRsvpReload = false;
        location.reload();
        return;
    }

    // If user just signed in and we're on rehearsal detail, refresh it
    if (user && window.currentRehearsalId) {
        const rehearsalScreen = document.getElementById('screenRehearsalDetail');
        if (rehearsalScreen && rehearsalScreen.classList.contains('active')) {
            showRehearsalDetail(window.currentRehearsalId);
        }
    }

    // Check for pending band join after sign in
    if (user && window.pendingBandJoin) {
        const bandId = window.pendingBandJoin;
        window.pendingBandJoin = null;
        await joinBand(bandId);
    }
    
    // Check for pending leader accept after sign in
    if (user && window.pendingLeaderAccept) {
        const bandId = window.pendingLeaderAccept;
        window.pendingLeaderAccept = null;
        await acceptLeaderRole(bandId);
    }
    
    // Handle return from calendar OAuth
    if (user && window.pendingCalendarSuccess) {
        window.pendingCalendarSuccess = false;
        // Refresh profile to get updated calendarConnected status
        const profile = await checkUserProfile(user);
        window.currentUserProfile = profile;
        
        // Check for saved form data to determine which screen
        const savedData = localStorage.getItem('pendingProfileData');
        if (savedData) {
            const formData = JSON.parse(savedData);
            
            if (formData.isSetup) {
                // Restore to profile setup screen
                localStorage.removeItem('pendingProfileData');
                showProfileSetup();
                
                // Restore form values
                document.getElementById('profileName').value = formData.name || '';
                document.getElementById('profileLocation').value = formData.location || '';
                document.getElementById('profileBio').value = formData.bio || '';
                document.getElementById('profileDiscoverable').checked = formData.discoverable !== false;
                
                // Restore selected instruments
                if (formData.instruments) {
                    formData.instruments.forEach(inst => {
                        const chip = document.querySelector(`#instrumentGrid [data-instrument="${inst}"]`);
                        if (chip) chip.classList.add('selected');
                    });
                }
                
                // Update calendar UI to show connected
                const setupCalStatus = document.getElementById('setupCalendarStatus');
                if (setupCalStatus) {
                    setupCalStatus.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 8px; color: #4CAF50;">
                            <span>Calendar Connected</span>
                        </div>
                    `;
                }
                alert('Calendar connected! Now save your profile to finish setup.');
            } else {
                // Restore to edit profile screen - showEditProfile will handle the pending data
                showEditProfile();
                alert('Calendar connected! Now save your profile to keep your changes.');
            }
        } else {
            alert('Calendar connected! Band leaders can now find times that work for you.');
            showEditProfile();
        }
    } else if (user && window.pendingEditProfile) {
        window.pendingEditProfile = false;
        showEditProfile();
    } else if (user && window.pendingShowBands) {
        window.pendingShowBands = false;
        showMyBands();
    } else if (user && window.pendingViewProfile) {
        window.pendingViewProfile = false;
        viewMusicianProfile(user.uid);
    } else if (user && window.pendingViewMusician) {
        const musicianId = window.pendingViewMusician;
        window.pendingViewMusician = null;
        viewMusicianProfile(musicianId);
    } else if (user && window.pendingShowGigs) {
        window.pendingShowGigs = false;
        showMySchedule();
    } else if (user && window.pendingShowSchedule) {
        window.pendingShowSchedule = false;
        showMySchedule();
    } else if (user && window.pendingNewRehearsal) {
        window.pendingNewRehearsal = false;
        showCreateRehearsal();
    } else if (user && (window.pendingRehearsalDetail || sessionStorage.getItem('pendingRehearsalDetail'))) {
        const rId = window.pendingRehearsalDetail || sessionStorage.getItem('pendingRehearsalDetail');
        window.pendingRehearsalDetail = null;
        sessionStorage.removeItem('pendingRehearsalDetail');
        showRehearsalDetail(rId);
    } else if (user && window.pendingBandDetail) {
        const bandId = window.pendingBandDetail;
        window.pendingBandDetail = false;
        showBandDetail(bandId);
    }
});

// Backward-compat shims — old call sites get routed to the welcome screen
window.signInWithGoogleAndCheckProfile = function() {
    showWelcomeScreen();
};
window.signInWithGoogle = async function() {
    showWelcomeScreen();
    return null;
};

function updateAuthUI(user) {
    const userInfo = document.getElementById('userInfo');
    const signInPromptHome = document.getElementById('signInPromptHome');
    const signInPromptFeed = document.getElementById('signInPromptFeed');
    const createPostPrompt = document.querySelector('.create-post-prompt');

    if (user) {
        // Use primary profile photo if available, otherwise Google photo
        const photoURL = getPrimaryPhotoURL(window.currentUserProfile) || user.photoURL || '';
        const displayName = window.currentUserProfile?.name || user.displayName || user.email;

        if (userInfo) {
            userInfo.innerHTML = `
                <img src="${photoURL}" class="user-avatar" onerror="this.style.display='none'">
                <span class="user-name">${displayName}</span>
                <button class="sign-out-btn" onclick="signOutUser()">Sign Out</button>
            `;
            userInfo.style.display = 'flex';
        }
        if (signInPromptHome) signInPromptHome.style.display = 'none';
        if (signInPromptFeed) signInPromptFeed.style.display = 'none';
        if (createPostPrompt) createPostPrompt.style.display = 'flex';
    } else {
        if (userInfo) userInfo.style.display = 'none';
        if (signInPromptHome) signInPromptHome.style.display = 'block';
        if (signInPromptFeed) signInPromptFeed.style.display = 'block';
        if (createPostPrompt) createPostPrompt.style.display = 'none';
    }
}

function showHomeScreen() {
    showFeedHome();
}

window.showHomeScreen = showHomeScreen;

// Handle browser back/forward buttons
window.addEventListener('popstate', function(event) {
    const path = window.location.pathname;
    
    if (path === '/' || path === '') {
        if (window.currentUser) showFeedHome(); else showWelcomeScreen();
    } else if (path === '/bands') {
        if (window.currentUser) showMyBands();
    } else if (path === '/gigs' || path === '/schedule') {
        if (window.currentUser) showMySchedule();
    } else if (path === '/profile') {
        if (window.currentUser) viewMusicianProfile(window.currentUser.uid);
    } else if (path === '/edit-profile') {
        if (window.currentUser) showEditProfile();
    } else if (path.match(/^\/musician\/([a-zA-Z0-9]+)$/)) {
        const musicianId = path.split('/')[2];
        viewMusicianProfile(musicianId);
    } else if (path.match(/^\/band\/([a-zA-Z0-9]+)$/)) {
        const bandId = path.split('/')[2];
        if (window.currentUser) showBandDetail(bandId);
    } else if (path.match(/^\/b\/([a-zA-Z0-9]+)$/)) {
        const bandId = path.split('/')[2];
        showBandInviteLanding(bandId);
    } else if (path === '/new-rehearsal') {
        if (window.currentUser) showCreateRehearsal();
    } else if (path.match(/^\/r\/([a-zA-Z0-9]+)$/)) {
        const rehearsalId = path.split('/')[2];
        showRehearsalDetail(rehearsalId);
    }
});

// Menu functions
function toggleMenu() {
    const overlay = document.getElementById('menuOverlay');
    const menu = document.getElementById('slideMenu');
    overlay.classList.toggle('visible');
    menu.classList.toggle('visible');
}

function goHome() {
    // Close menu if it's open
    const overlay = document.getElementById('menuOverlay');
    const menu = document.getElementById('slideMenu');
    overlay.classList.remove('visible');
    menu.classList.remove('visible');

    showFeedHome();

    // Update tab bar
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const tabFeed = document.getElementById('tabFeed');
    if (tabFeed) tabFeed.classList.add('active');
}

function goToMyGigs() {
    toggleMenu();
    showMySchedule();
}

function goToMySchedule() {
    toggleMenu();
    showMySchedule();
}

function goToMyBands() {
    toggleMenu();
    showMyBands();
}

function goToHelp() {
    toggleMenu();
    showHelp();
}

function showHelp() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screenHelp').classList.add('active');
}
window.showHelp = showHelp;

async function signInFromMenu() {
    toggleMenu();
    await signInWithGoogleAndCheckProfile();
    updateMenuAuth();
}

function signOutFromMenu() {
    toggleMenu();
    signOutUser();
    updateMenuAuth();
}

// Expose menu functions to window for onclick handlers
window.toggleMenu = toggleMenu;
window.goHome = goHome;
window.goToMyGigs = goToMyGigs;
window.goToMySchedule = goToMySchedule;
window.goToMyBands = goToMyBands;
window.goToHelp = goToHelp;
window.signInFromMenu = signInFromMenu;
window.signOutFromMenu = signOutFromMenu;

function showGlobalHeader() {
    document.getElementById('globalHeader').classList.add('visible');
    document.body.classList.add('has-header');
}

function hideGlobalHeader() {
    // Keep header always visible for menu access
    // Header stays visible, so don't remove classes
}

function updateMenuAuth() {
    const user = window.currentUser;
    const menuUserInfo = document.getElementById('menuUserInfo');
    const menuSignIn = document.getElementById('menuSignIn');
    const menuSignOut = document.getElementById('menuSignOut');
    const menuEditProfile = document.getElementById('menuEditProfile');
    const menuViewProfile = document.getElementById('menuViewProfile');
    const menuProfileDivider = document.getElementById('menuProfileDivider');

    if (user) {
        // Use primary profile photo if available, otherwise Google photo
        const photoURL = getPrimaryPhotoURL(window.currentUserProfile) || user.photoURL || '';
        const displayName = window.currentUserProfile?.name || user.displayName || '';

        menuUserInfo.innerHTML = `
            <img src="${photoURL}" class="menu-user-avatar" onerror="this.style.display='none'">
            <div>
                <div class="menu-user-name">${displayName}</div>
                <div class="menu-user-email">${user.email || ''}</div>
            </div>
        `;
        menuUserInfo.style.display = 'flex';
        menuUserInfo.className = 'menu-user-info';
        menuSignIn.style.display = 'none';
        menuSignOut.style.display = 'flex';
        // Show profile options for logged in users
        if (menuEditProfile) menuEditProfile.style.display = 'flex';
        if (menuViewProfile) menuViewProfile.style.display = 'flex';
        if (menuProfileDivider) menuProfileDivider.style.display = 'block';
    } else {
        menuUserInfo.style.display = 'none';
        menuSignIn.style.display = 'flex';
        menuSignOut.style.display = 'none';
        // Hide profile options for logged out users
        if (menuEditProfile) menuEditProfile.style.display = 'none';
        if (menuViewProfile) menuViewProfile.style.display = 'none';
        if (menuProfileDivider) menuProfileDivider.style.display = 'none';
    }
}


function goToEditProfile() {
    toggleMenu();
    showEditProfile();
}
window.goToEditProfile = goToEditProfile;

function goToViewMyProfile() {
    toggleMenu();
    if (window.currentUser) {
        viewMusicianProfile(window.currentUser.uid);
    } else {
        alert('Please sign in first');
    }
}
window.goToViewMyProfile = goToViewMyProfile;

// Update menu auth state when auth changes
window.updateMenuAuth = updateMenuAuth;

// ===== PROFILE SYSTEM =====

// Current user profile data
window.currentUserProfile = null;

// Check if user has a profile
async function checkUserProfile(user) {
    if (!user) return null;
    
    try {
        const profileRef = doc(db, "users", user.uid);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
            window.currentUserProfile = profileSnap.data();
            return window.currentUserProfile;
        }
        return null;
    } catch (error) {
        console.error("Error checking profile:", error);
        return null;
    }
}

// Show profile setup screen
function showProfileSetup() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screenProfileSetup').classList.add('active');
    hideGlobalHeader();

    // Reset photo state for multi-photo management
    window.pendingProfilePhotos = [];
    window.photosToDelete = [];

    // Pre-fill with Google account info
    if (window.currentUser) {
        document.getElementById('profileName').value = window.currentUser.displayName || '';
    }

    // Initialize photo grid (empty for new profiles)
    updatePhotoManagementUI('setup');
    
    // Check if calendar is already connected
    const setupCalStatus = document.getElementById('setupCalendarStatus');
    if (setupCalStatus && window.currentUserProfile?.calendarConnected) {
        setupCalStatus.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; color: #4CAF50;">
                <span>Calendar Connected</span>
            </div>
        `;
    }
}
window.showProfileSetup = showProfileSetup;

// Toggle instrument selection
function toggleInstrument(chip) {
    chip.classList.toggle('selected');
}
window.toggleInstrument = toggleInstrument;

// Toggle Other instrument with text field
function toggleInstrumentOther(chip, inputId) {
    chip.classList.toggle('selected');
    const wrapper = document.getElementById(inputId + 'Wrapper');
    if (chip.classList.contains('selected')) {
        wrapper.style.display = 'block';
        document.getElementById(inputId).focus();
    } else {
        wrapper.style.display = 'none';
        document.getElementById(inputId).value = '';
    }
}
window.toggleInstrumentOther = toggleInstrumentOther;

// Location data
const cities = [
    "New York, NY", "Brooklyn, NY", "Queens, NY", "Los Angeles, CA", "Chicago, IL",
    "Houston, TX", "Phoenix, AZ", "Philadelphia, PA", "San Antonio, TX", "San Diego, CA",
    "Dallas, TX", "Austin, TX", "San Francisco, CA", "Seattle, WA", "Denver, CO",
    "Boston, MA", "Nashville, TN", "Portland, OR", "Atlanta, GA", "Miami, FL",
    "Minneapolis, MN", "Detroit, MI", "New Orleans, LA", "Las Vegas, NV", "Oakland, CA",
    "Cleveland, OH", "Pittsburgh, PA", "Richmond, VA", "Baltimore, MD", "Charlotte, NC",
    "Raleigh, NC", "San Jose, CA", "Kansas City, MO", "St. Louis, MO", "Salt Lake City, UT",
    "Tampa, FL", "Orlando, FL", "Indianapolis, IN", "Columbus, OH", "Milwaukee, WI",
    "Providence, RI", "Louisville, KY", "Memphis, TN", "Washington, DC", "Sacramento, CA"
];

function filterLocations(input, dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    const val = input.value.toLowerCase().trim();
    
    if (val.length === 0) {
        dropdown.classList.remove('visible');
        return;
    }
    
    const matches = cities.filter(c => c.toLowerCase().includes(val)).slice(0, 5);
    
    if (matches.length === 0) {
        dropdown.classList.remove('visible');
        return;
    }
    
    dropdown.innerHTML = matches.map(city => 
        `<div class="location-option" onmousedown="selectCity('${city}', '${input.id}', '${dropdownId}')">${city}</div>`
    ).join('');
    dropdown.classList.add('visible');
}
window.filterLocations = filterLocations;

function selectCity(city, inputId, dropdownId) {
    document.getElementById(inputId).value = city;
    document.getElementById(dropdownId).classList.remove('visible');
}
window.selectCity = selectCity;

// Hide dropdowns when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.location-input-wrapper')) {
        document.querySelectorAll('.location-dropdown').forEach(el => el.classList.remove('visible'));
    }
});

// Get selected instruments from a grid
function getSelectedInstruments(gridId, otherInputId) {
    const grid = document.getElementById(gridId);
    const selected = grid.querySelectorAll('.instrument-chip.selected');
    let instruments = Array.from(selected).map(chip => chip.dataset.instrument);
    
    // If "other" is selected, replace with the custom value
    if (otherInputId && instruments.includes('other')) {
        const otherValue = document.getElementById(otherInputId).value.trim();
        if (otherValue) {
            instruments = instruments.filter(i => i !== 'other');
            instruments.push(otherValue.toLowerCase());
        }
    }
    
    return instruments;
}

// Set selected instruments in a grid
function setSelectedInstruments(gridId, instruments, otherInputId) {
    const grid = document.getElementById(gridId);
    const knownInstruments = ['vocals', 'guitar', 'bass', 'drums', 'keys', 'saxophone', 'trumpet', 'violin', 'other'];
    let hasCustomInstrument = false;
    let customInstrument = '';
    
    grid.querySelectorAll('.instrument-chip').forEach(chip => {
        const inst = chip.dataset.instrument;
        if (instruments && instruments.includes(inst)) {
            chip.classList.add('selected');
        } else {
            chip.classList.remove('selected');
        }
    });
    
    // Check for custom instruments not in the known list
    if (instruments && otherInputId) {
        instruments.forEach(inst => {
            if (!knownInstruments.includes(inst)) {
                hasCustomInstrument = true;
                customInstrument = inst;
            }
        });
        
        if (hasCustomInstrument) {
            const otherChip = grid.querySelector('[data-instrument="other"]');
            if (otherChip) otherChip.classList.add('selected');
            document.getElementById(otherInputId + 'Wrapper').style.display = 'block';
            document.getElementById(otherInputId).value = customInstrument;
        }
    }
}

// Show/hide the SMS consent checkbox block based on whether a phone number is entered.
// Called from the `oninput` handler of the phone fields in index.html.
// prefix is 'profile' or 'editProfile' (matches element id prefixes).
window.SMS_CONSENT_DISCLOSURE_TEXT = 'I agree to receive SMS from Tempo about rehearsals, gigs, RSVPs, and band group messages. Msg & data rates may apply. Msg frequency varies. Reply STOP to opt out, HELP for help. See SMS Terms and Privacy Policy. Mobile information and opt-in consent will not be shared with third parties or affiliates for marketing or promotional purposes.';
window.SMS_CONSENT_DISCLOSURE_VERSION = '2026-04-16';

function updateSmsConsentVisibility(prefix) {
    const phoneField = document.getElementById(prefix + 'Phone');
    const block = document.getElementById(prefix + 'SmsConsentBlock');
    if (!phoneField || !block) return;
    const hasPhone = phoneField.value.trim().length > 0;
    block.style.display = hasPhone ? 'block' : 'none';
    if (!hasPhone) {
        const cb = document.getElementById(prefix + 'SmsConsent');
        if (cb) cb.checked = false;
    }
}
window.updateSmsConsentVisibility = updateSmsConsentVisibility;

// Save new profile
async function saveProfile() {
    const name = document.getElementById('profileName').value.trim();
    const location = document.getElementById('profileLocation').value.trim();
    const bio = document.getElementById('profileBio').value.trim();
    const phoneRaw = document.getElementById('profilePhone')?.value.trim() || '';
    const phone = phoneRaw ? normalizePhoneNumber(phoneRaw) : null;
    const smsConsentChecked = document.getElementById('profileSmsConsent')?.checked || false;
    const instruments = getSelectedInstruments('instrumentGrid', 'profileOtherInstrument');
    const discoverable = document.getElementById('profileDiscoverable').checked;

    if (!name) {
        alert('Please enter your name');
        return;
    }

    if (instruments.length === 0) {
        alert('Please select at least one instrument');
        return;
    }

    if (phone && !smsConsentChecked) {
        alert('Please check the SMS consent box to save your phone number, or remove the phone number to continue.');
        return;
    }
    
    try {
        const user = window.currentUser;
        if (!user) {
            alert('Please sign in first');
            return;
        }

        // Upload photos if any were selected
        let photos = [];
        let photoURL = user.photoURL || null;
        if (window.pendingProfilePhotos.length > 0) {
            photos = await uploadProfilePhotos(user.uid);
            // Set photoURL to primary photo for backward compatibility
            const primary = photos.find(p => p.isPrimary);
            if (primary) {
                photoURL = primary.url;
            } else if (photos.length > 0) {
                photoURL = photos[0].url;
            }
        }

        const profileData = {
            name,
            email: user.email,
            phone,
            location,
            bio,
            instruments,
            discoverable,
            photoURL,
            photos,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        if (phone && smsConsentChecked) {
            profileData.smsConsent = {
                consentedAt: serverTimestamp(),
                disclosureText: window.SMS_CONSENT_DISCLOSURE_TEXT,
                disclosureVersion: window.SMS_CONSENT_DISCLOSURE_VERSION,
                source: 'in-app-profile-create'
            };
        }

        await setDoc(doc(db, "users", user.uid), profileData);

        window.currentUserProfile = profileData;
        console.log("Profile saved successfully");

        // Reset photo state
        window.pendingProfilePhotos = [];
        window.photosToDelete = [];

        // Update menu with new profile info
        updateMenuAuth();

        // Check if there's a pending band to join
        if (window.pendingBandJoin) {
            const bandId = window.pendingBandJoin;
            window.pendingBandJoin = null;
            await joinBandFromInvite(bandId);
        } else if (window.pendingLeaderAccept) {
            const bandId = window.pendingLeaderAccept;
            window.pendingLeaderAccept = null;
            await acceptLeaderRole(bandId);
        } else {
            // Go to home screen
            showHomeScreen();
        }

    } catch (error) {
        console.error("Error saving profile:", error);
        alert("Error saving profile: " + error.message);
    }
}
window.saveProfile = saveProfile;

// Skip profile setup
function skipProfileSetup() {
    showHomeScreen();
}
window.skipProfileSetup = skipProfileSetup;

// Show edit profile screen
async function showEditProfile() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screenEditProfile').classList.add('active');
    hideGlobalHeader();
    window.history.pushState({}, '', '/edit-profile');

    // Reset photo state for multi-photo management
    window.pendingProfilePhotos = [];
    window.photosToDelete = [];

    // Load current profile data
    const user = window.currentUser;
    if (!user) {
        alert('Please sign in first');
        showHomeScreen();
        return;
    }

    // Helper to load photos into pending array
    function loadPhotos(profile) {
        window.pendingProfilePhotos = [];
        if (profile?.photos && profile.photos.length > 0) {
            // Load from photos array
            profile.photos.forEach(photo => {
                window.pendingProfilePhotos.push({
                    url: photo.url,
                    isPrimary: photo.isPrimary,
                    isNew: false,
                    storagePath: photo.storagePath,
                    uploadedAt: photo.uploadedAt
                });
            });
        } else if (profile?.photoURL) {
            // Backward compatibility: single photoURL
            window.pendingProfilePhotos.push({
                url: profile.photoURL,
                isPrimary: true,
                isNew: false
            });
        }
        updatePhotoManagementUI('edit');
    }
    
    // Check for pending form data (saved before OAuth redirect)
    const pendingData = localStorage.getItem('pendingProfileData');
    if (pendingData) {
        const formData = JSON.parse(pendingData);
        localStorage.removeItem('pendingProfileData');
        
        // Restore form values
        document.getElementById('editProfileName').value = formData.name || '';
        document.getElementById('editProfileLocation').value = formData.location || '';
        document.getElementById('editProfileBio').value = formData.bio || '';
        document.getElementById('editProfileDiscoverable').checked = formData.discoverable !== false;
        
        // Restore selected instruments
        if (formData.instruments) {
            // Clear existing selections
            document.querySelectorAll('#editInstrumentGrid .instrument-chip').forEach(c => c.classList.remove('selected'));
            formData.instruments.forEach(inst => {
                const chip = document.querySelector(`#editInstrumentGrid [data-instrument="${inst}"]`);
                if (chip) chip.classList.add('selected');
            });
        }
        
        // Load photos from profile
        loadPhotos(window.currentUserProfile);
        
        // Calendar is now connected
        updateCalendarUI(true);
        return;
    }
    
    // Check for existing profile
    let profile = window.currentUserProfile;
    if (!profile) {
        profile = await checkUserProfile(user);
    }
    
    if (profile) {
        document.getElementById('editProfileName').value = profile.name || '';
        document.getElementById('editProfileLocation').value = profile.location || '';
        document.getElementById('editProfileBio').value = profile.bio || '';
        document.getElementById('editProfileDiscoverable').checked = profile.discoverable !== false;
        setSelectedInstruments('editInstrumentGrid', profile.instruments, 'editOtherInstrument');
        loadPhotos(profile);

        // Load new fields
        document.getElementById('editProfileInfluences').value = profile.influences || '';
        document.getElementById('editProfileWorkingOn').value = profile.workingOn || '';

        // Load phone number
        const phoneField = document.getElementById('editProfilePhone');
        if (phoneField) {
            phoneField.value = profile.phone ? formatPhoneDisplay(profile.phone) : '';
        }

        // If the user already has a phone on file with a recorded consent, pre-check the
        // consent box and show the consent block so they see the disclosure.
        const hasExistingConsent = !!(profile.phone && profile.smsConsent && profile.smsConsent.consentedAt);
        const editConsentCb = document.getElementById('editProfileSmsConsent');
        if (editConsentCb) editConsentCb.checked = hasExistingConsent;
        updateSmsConsentVisibility('editProfile');

        // Load social links
        const links = profile.socialLinks || {};
        document.getElementById('editProfileInstagram').value = links.instagram || '';
        document.getElementById('editProfileSpotify').value = links.spotify || '';
        document.getElementById('editProfileYouTube').value = links.youtube || '';
        document.getElementById('editProfileBandcamp').value = links.bandcamp || '';
        document.getElementById('editProfileSoundCloud').value = links.soundcloud || '';
        document.getElementById('editProfileLinktree').value = links.linktree || '';

        // Load genre tags
        window.genreTags = profile.genres || [];
        renderTags('genre');

        // Show calendar connection status
        updateCalendarUI(profile.calendarConnected);
    } else {
        // No profile, use Google account info
        document.getElementById('editProfileName').value = user.displayName || '';
        // No photos yet, just show empty grid
        updatePhotoManagementUI('edit');
        updateCalendarUI(false);

        // Clear new fields
        document.getElementById('editProfileInfluences').value = '';
        document.getElementById('editProfileWorkingOn').value = '';
        document.getElementById('editProfileInstagram').value = '';
        document.getElementById('editProfileSpotify').value = '';
        document.getElementById('editProfileYouTube').value = '';
        document.getElementById('editProfileBandcamp').value = '';
        document.getElementById('editProfileSoundCloud').value = '';
        document.getElementById('editProfileLinktree').value = '';
        window.genreTags = [];
        renderTags('genre');
    }
}
window.showEditProfile = showEditProfile;

// Update calendar connection UI
function updateCalendarUI(isConnected) {
    const notConnected = document.getElementById('calendarNotConnected');
    const connected = document.getElementById('calendarConnected');
    
    if (isConnected) {
        notConnected.style.display = 'none';
        connected.style.display = 'block';
    } else {
        notConnected.style.display = 'block';
        connected.style.display = 'none';
    }
}

// Connect Google Calendar via proper OAuth
function connectGoogleCalendar() {
    if (!window.currentUser) {
        alert('Please sign in first');
        return;
    }
    
    // Check if we're on profile setup or edit profile
    const isSetup = document.getElementById('screenProfileSetup').classList.contains('active');
    
    // Save form data before redirecting
    if (isSetup) {
        const formData = {
            name: document.getElementById('profileName').value,
            location: document.getElementById('profileLocation').value,
            bio: document.getElementById('profileBio').value,
            instruments: getSelectedInstruments('instrumentGrid', 'profileOtherInstrument'),
            discoverable: document.getElementById('profileDiscoverable').checked,
            isSetup: true
        };
        localStorage.setItem('pendingProfileData', JSON.stringify(formData));
    } else {
        const formData = {
            name: document.getElementById('editProfileName').value,
            location: document.getElementById('editProfileLocation').value,
            bio: document.getElementById('editProfileBio').value,
            instruments: getSelectedInstruments('editInstrumentGrid', 'editOtherInstrument'),
            discoverable: document.getElementById('editProfileDiscoverable').checked,
            isSetup: false
        };
        localStorage.setItem('pendingProfileData', JSON.stringify(formData));
    }
    
    // Redirect to OAuth flow
    const returnUrl = encodeURIComponent(window.location.origin + '?calendarConnected=true');
    const authUrl = `https://us-central1-bandcal-89c81.cloudfunctions.net/startCalendarAuth?userId=${window.currentUser.uid}&returnUrl=${returnUrl}`;
    
    window.location.href = authUrl;
}
window.connectGoogleCalendar = connectGoogleCalendar;

// Disconnect Google Calendar
async function disconnectGoogleCalendar() {
    if (!window.currentUser) return;
    
    if (!confirm('Disconnect your calendar? Band leaders won\'t be able to see your availability.')) {
        return;
    }
    
    try {
        const response = await fetch(`https://us-central1-bandcal-89c81.cloudfunctions.net/disconnectCalendar?userId=${window.currentUser.uid}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (window.currentUserProfile) {
                window.currentUserProfile.calendarConnected = false;
            }
            updateCalendarUI(false);
        } else {
            alert('Error disconnecting calendar');
        }
        
    } catch (error) {
        console.error('Error disconnecting calendar:', error);
        alert('Error disconnecting calendar');
    }
}
window.disconnectGoogleCalendar = disconnectGoogleCalendar;

// Update existing profile
async function updateProfile() {
    const name = document.getElementById('editProfileName').value.trim();
    const location = document.getElementById('editProfileLocation').value.trim();
    const bio = document.getElementById('editProfileBio').value.trim();
    const instruments = getSelectedInstruments('editInstrumentGrid', 'editOtherInstrument');
    const discoverable = document.getElementById('editProfileDiscoverable').checked;
    
    // New fields
    const genres = window.genreTags || [];
    const influences = document.getElementById('editProfileInfluences')?.value.trim() || '';
    const workingOn = document.getElementById('editProfileWorkingOn')?.value.trim() || '';
    
    // Social links
    const socialLinks = {
        instagram: document.getElementById('editProfileInstagram')?.value.trim() || '',
        spotify: document.getElementById('editProfileSpotify')?.value.trim() || '',
        youtube: document.getElementById('editProfileYouTube')?.value.trim() || '',
        bandcamp: document.getElementById('editProfileBandcamp')?.value.trim() || '',
        soundcloud: document.getElementById('editProfileSoundCloud')?.value.trim() || '',
        linktree: document.getElementById('editProfileLinktree')?.value.trim() || ''
    };

    // Phone number
    const phoneRaw = document.getElementById('editProfilePhone')?.value.trim() || '';
    const phone = phoneRaw ? normalizePhoneNumber(phoneRaw) : null;
    const smsConsentChecked = document.getElementById('editProfileSmsConsent')?.checked || false;

    if (!name) {
        alert('Please enter your name');
        return;
    }

    if (instruments.length === 0) {
        alert('Please select at least one instrument');
        return;
    }

    if (phone && !smsConsentChecked) {
        alert('Please check the SMS consent box to save your phone number, or remove the phone number to continue.');
        return;
    }
    
    try {
        const user = window.currentUser;
        if (!user) {
            alert('Please sign in first');
            return;
        }

        // Upload photos if any pending
        let photos = [];
        let photoURL = window.currentUserProfile?.photoURL || user.photoURL || null;

        if (window.pendingProfilePhotos.length > 0) {
            photos = await uploadProfilePhotos(user.uid);
            // Set photoURL to primary photo for backward compatibility
            const primary = photos.find(p => p.isPrimary);
            if (primary) {
                photoURL = primary.url;
            } else if (photos.length > 0) {
                photoURL = photos[0].url;
            }
        } else if (window.photosToDelete.length > 0) {
            // Only deletions, no new photos - still need to process deletions
            photos = await uploadProfilePhotos(user.uid);
            if (photos.length > 0) {
                const primary = photos.find(p => p.isPrimary);
                photoURL = primary ? primary.url : photos[0].url;
            } else {
                photoURL = null;
            }
        } else {
            // No changes to photos, keep existing
            photos = window.currentUserProfile?.photos || [];
        }

        const profileData = {
            name,
            email: user.email,
            phone,
            location,
            bio,
            instruments,
            discoverable,
            photoURL,
            photos,
            genres,
            influences,
            workingOn,
            socialLinks,
            updatedAt: serverTimestamp()
        };

        // Add createdAt if this is a new profile
        if (!window.currentUserProfile) {
            profileData.createdAt = serverTimestamp();
        }

        // SMS consent: only (re)record if the user has a phone + checked the box.
        // Preserve an existing consent record if they checked the box and already had one for this number;
        // otherwise, write a fresh one. If the phone was removed, consent is moot — drop it.
        if (phone && smsConsentChecked) {
            const existing = window.currentUserProfile?.smsConsent;
            const phoneUnchanged = window.currentUserProfile?.phone === phone;
            if (existing && phoneUnchanged) {
                profileData.smsConsent = existing;
            } else {
                profileData.smsConsent = {
                    consentedAt: serverTimestamp(),
                    disclosureText: window.SMS_CONSENT_DISCLOSURE_TEXT,
                    disclosureVersion: window.SMS_CONSENT_DISCLOSURE_VERSION,
                    source: 'in-app-profile-edit'
                };
            }
        } else if (!phone) {
            profileData.smsConsent = null;
        }

        // Use setDoc with merge to create or update
        await setDoc(doc(db, "users", user.uid), profileData, { merge: true });

        window.currentUserProfile = { ...window.currentUserProfile, ...profileData };
        console.log("Profile updated successfully");

        // Reset photo state
        window.pendingProfilePhotos = [];
        window.photosToDelete = [];

        // Update menu with new profile info
        updateMenuAuth();

        showHomeScreen();

    } catch (error) {
        console.error("Error updating profile:", error);
        alert("Error updating profile: " + error.message);
    }
}
window.updateProfile = updateProfile;

// Profile photo upload storage
window.pendingProfilePhoto = null;

// Multi-photo support
window.pendingProfilePhotos = []; // Array of {file, dataUrl, isNew, isPrimary, storagePath?}
window.photosToDelete = []; // Storage paths of photos to delete on save
window.currentCarouselIndex = 0;

// Helper to get primary photo URL from profile (backward compatible)
function getPrimaryPhotoURL(profile) {
    if (!profile) return null;
    // If profile has photos array, find primary
    if (profile.photos && profile.photos.length > 0) {
        const primary = profile.photos.find(p => p.isPrimary);
        return primary ? primary.url : profile.photos[0].url;
    }
    // Fall back to photoURL for backward compatibility
    return profile.photoURL || null;
}
window.getPrimaryPhotoURL = getPrimaryPhotoURL;

// Upload multiple profile photos and manage deletions
async function uploadProfilePhotos(userId) {
    const uploadedPhotos = [];

    // First, delete any photos marked for deletion
    for (const storagePath of window.photosToDelete) {
        try {
            const fileRef = storageRef(storage, storagePath);
            await deleteObject(fileRef);
            console.log('Deleted photo:', storagePath);
        } catch (error) {
            console.warn('Could not delete photo:', storagePath, error);
        }
    }
    window.photosToDelete = [];

    // Upload new photos and keep existing ones
    for (const photo of window.pendingProfilePhotos) {
        if (photo.isNew && photo.file) {
            // Upload new photo
            try {
                const storagePath = `profile-photos/${userId}/${Date.now()}_${photo.file.name}`;
                const fileRef = storageRef(storage, storagePath);
                await uploadBytes(fileRef, photo.file);
                const downloadURL = await getDownloadURL(fileRef);
                uploadedPhotos.push({
                    url: downloadURL,
                    isPrimary: photo.isPrimary,
                    uploadedAt: new Date().toISOString(),
                    storagePath: storagePath
                });
                console.log('Uploaded photo:', storagePath);
            } catch (error) {
                console.error('Error uploading photo:', error);
            }
        } else if (!photo.isNew) {
            // Keep existing photo - only include defined fields
            const existingPhoto = {
                url: photo.url,
                isPrimary: photo.isPrimary || false
            };
            // Only add optional fields if they have values
            if (photo.uploadedAt) existingPhoto.uploadedAt = photo.uploadedAt;
            if (photo.storagePath) existingPhoto.storagePath = photo.storagePath;
            uploadedPhotos.push(existingPhoto);
        }
    }

    // Ensure exactly one photo is primary
    if (uploadedPhotos.length > 0) {
        const hasPrimary = uploadedPhotos.some(p => p.isPrimary);
        if (!hasPrimary) {
            uploadedPhotos[0].isPrimary = true;
        }
    }

    window.pendingProfilePhotos = [];
    return uploadedPhotos;
}

// Update photo management UI for setup/edit screens
function updatePhotoManagementUI(mode) {
    const containerId = mode === 'setup' ? 'setupPhotoGrid' : 'editPhotoGrid';
    const container = document.getElementById(containerId);
    if (!container) return;

    let html = '';

    // Render existing photos
    window.pendingProfilePhotos.forEach((photo, index) => {
        const isPrimary = photo.isPrimary;
        html += `
            <div class="photo-grid-item ${isPrimary ? 'is-primary' : ''}">
                <img src="${photo.dataUrl || photo.url}" alt="Photo ${index + 1}">
                ${isPrimary ? '<span class="photo-primary-badge">Primary</span>' : ''}
                <div class="photo-actions-overlay">
                    ${!isPrimary ? `<button class="photo-action-btn star-btn" onclick="setPhotoPrimary(${index}, '${mode}')" title="Set as primary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </button>` : ''}
                    <button class="photo-action-btn delete-btn" onclick="deletePhoto(${index}, '${mode}')" title="Delete photo">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
        `;
    });

    // Add upload button if under limit (5 photos max)
    if (window.pendingProfilePhotos.length < 5) {
        html += `
            <div class="photo-grid-item add-photo" onclick="triggerPhotoUpload('${mode}')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>Add Photo</span>
            </div>
        `;
    }

    container.innerHTML = html;
}
window.updatePhotoManagementUI = updatePhotoManagementUI;

// Set a photo as primary
function setPhotoPrimary(index, mode) {
    window.pendingProfilePhotos.forEach((photo, i) => {
        photo.isPrimary = (i === index);
    });
    updatePhotoManagementUI(mode);
}
window.setPhotoPrimary = setPhotoPrimary;

// Delete a photo
function deletePhoto(index, mode) {
    const photo = window.pendingProfilePhotos[index];
    if (photo && photo.storagePath && !photo.isNew) {
        // Mark for deletion from storage on save
        window.photosToDelete.push(photo.storagePath);
    }
    window.pendingProfilePhotos.splice(index, 1);

    // If we deleted the primary, make first remaining photo primary
    if (photo.isPrimary && window.pendingProfilePhotos.length > 0) {
        window.pendingProfilePhotos[0].isPrimary = true;
    }

    updatePhotoManagementUI(mode);
}
window.deletePhoto = deletePhoto;

// Trigger file upload input
function triggerPhotoUpload(mode) {
    const inputId = mode === 'setup' ? 'profilePhotoInput' : 'editProfilePhotoInput';
    document.getElementById(inputId).click();
}
window.triggerPhotoUpload = triggerPhotoUpload;

// Handle profile photo selection
async function handleProfilePhotoSelect(event, mode) {
    let file = event.target.files[0];
    if (!file) return;

    // Reset file input so same file can be selected again
    event.target.value = '';

    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('Image must be less than 5MB');
        return;
    }

    // Read as data URL for preview
    const reader = new FileReader();
    reader.onload = function(e) {
        console.log('FileReader loaded, adding to photos array');

        // Determine if this should be primary (first photo)
        const isPrimary = window.pendingProfilePhotos.length === 0;

        // Add to pending photos array
        window.pendingProfilePhotos.push({
            file: file,
            dataUrl: e.target.result,
            isNew: true,
            isPrimary: isPrimary
        });

        // Update the UI
        updatePhotoManagementUI(mode);
        console.log('Photo added, total:', window.pendingProfilePhotos.length);
    };
    reader.onerror = function(e) {
        console.error('FileReader error:', e);
        alert('Error reading image file');
    };
    reader.readAsDataURL(file);
    console.log('Reading file as data URL:', file.name, file.type);

    // Also store in legacy variable for backward compatibility
    window.pendingProfilePhoto = file;
}
window.handleProfilePhotoSelect = handleProfilePhotoSelect;

// Resize image to max dimension while maintaining aspect ratio
async function resizeImageFile(file, maxSize) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function() {
            // Calculate new dimensions
            let width = img.width;
            let height = img.height;
            
            // Only resize if larger than maxSize
            if (width <= maxSize && height <= maxSize) {
                resolve(file);
                return;
            }
            
            // Scale down maintaining aspect ratio
            if (width > height) {
                height = Math.round(height * maxSize / width);
                width = maxSize;
            } else {
                width = Math.round(width * maxSize / height);
                height = maxSize;
            }
            
            // Create canvas and draw resized image
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            // Use high quality image smoothing
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convert to blob
            canvas.toBlob((blob) => {
                if (blob) {
                    const resizedFile = new File([blob], file.name, { type: 'image/jpeg' });
                    resolve(resizedFile);
                } else {
                    reject(new Error('Canvas toBlob failed'));
                }
            }, 'image/jpeg', 0.95);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

// Upload profile photo to Firebase Storage
async function uploadProfilePhoto(userId) {
    if (!window.pendingProfilePhoto) return null;
    
    try {
        const file = window.pendingProfilePhoto;
        const fileRef = window.storageRef(window.storage, `profile-photos/${userId}/${Date.now()}_${file.name}`);
        
        await uploadBytes(fileRef, file);
        const downloadURL = await getDownloadURL(fileRef);
        
        window.pendingProfilePhoto = null;
        return downloadURL;
    } catch (error) {
        console.error("Error uploading photo:", error);
        return null;
    }
}


// Get friendly label for instrument
function getInstrumentLabel(instrument) {
    const labels = {
        vocals: 'Vocals',
        guitar: 'Guitar',
        bass: 'Bass',
        drums: 'Drums',
        keys: 'Keys',
        saxophone: 'Saxophone',
        trumpet: 'Trumpet',
        violin: 'Strings',
        other: 'Other'
    };
    return labels[instrument] || instrument;
}

// Escape HTML for safety
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// View a musician's profile
async function viewMusicianProfile(userId) {
    // Clear all screens including inline styles
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = '';  // Clear inline display style
    });
    document.getElementById('screenMusicianProfile').classList.add('active');

    // Set URL - use /profile for own profile, /musician/id for others
    const isOwnProfile = window.currentUser && window.currentUser.uid === userId;
    if (isOwnProfile) {
        window.history.pushState({}, '', '/profile');
    } else {
        window.history.pushState({}, '', '/musician/' + userId);
    }

    // Store for contact
    window.viewingMusicianId = userId;

    try {
        const profileRef = doc(db, "users", userId);
        const profileSnap = await getDoc(profileRef);
        
        if (!profileSnap.exists()) {
            alert('Profile not found');
            showHomeScreen();
            return;
        }
        
        const profile = profileSnap.data();

        document.getElementById('viewProfileName').textContent = profile.name || 'Unknown';
        document.getElementById('viewProfileLocation').textContent = profile.location ? `${profile.location}` : '';

        // Initialize photo carousel
        let photos = profile.photos || [];
        // Backward compatibility: if no photos array but has photoURL, create single photo array
        if (photos.length === 0 && profile.photoURL) {
            photos = [{ url: profile.photoURL, isPrimary: true }];
        }
        const photoEl = document.getElementById('viewProfilePhoto');
        const primary = photos.find(p => p.isPrimary) || photos[0];
        if (photoEl) {
            photoEl.src = primary?.url || '';
            photoEl.style.display = primary?.url ? 'block' : 'none';
        }

        const instrumentsDiv = document.getElementById('viewProfileInstruments');
        instrumentsDiv.innerHTML = (profile.instruments || [])
            .map(i => `<span class="instrument-tag">${getInstrumentLabel(i)}</span>`)
            .join('');
        
        // Display genres
        const genresDiv = document.getElementById('viewProfileGenres');
        if (profile.genres && profile.genres.length > 0) {
            genresDiv.innerHTML = profile.genres
                .map(g => `<span class="genre-tag">${escapeHtml(g)}</span>`)
                .join('');
            genresDiv.style.display = 'flex';
        } else {
            genresDiv.style.display = 'none';
        }
        
        // Display bio
        if (profile.bio) {
            document.getElementById('viewProfileBio').textContent = profile.bio;
            document.getElementById('viewProfileBioCard').style.display = 'block';
        } else {
            document.getElementById('viewProfileBioCard').style.display = 'none';
        }
        
        // Display working on
        if (profile.workingOn) {
            document.getElementById('viewProfileWorkingOn').textContent = profile.workingOn;
            document.getElementById('viewProfileWorkingOnCard').style.display = 'block';
        } else {
            document.getElementById('viewProfileWorkingOnCard').style.display = 'none';
        }
        
        // Display influences
        if (profile.influences) {
            document.getElementById('viewProfileInfluences').textContent = profile.influences;
            document.getElementById('viewProfileInfluencesCard').style.display = 'block';
        } else {
            document.getElementById('viewProfileInfluencesCard').style.display = 'none';
        }
        
        // Display social links
        const socialLinksDiv = document.getElementById('viewProfileSocialLinks');
        const links = profile.socialLinks || {};
        const hasLinks = Object.values(links).some(v => v);
        
        if (hasLinks) {
            socialLinksDiv.innerHTML = renderSocialLinks(links);
            socialLinksDiv.style.display = 'flex';
        } else {
            socialLinksDiv.style.display = 'none';
        }
        
        // Update buttons based on whether viewing own profile
        const contactBtn = document.getElementById('contactMusicianBtn');
        const backBtn = document.getElementById('profileBackBtn');

        if (isOwnProfile) {
            contactBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M17 3l4 4L7 21H3v-4L17 3z"/></svg>Edit Profile';
            contactBtn.onclick = function() { showEditProfile(); };
            backBtn.innerHTML = 'Back to Home';
            backBtn.onclick = function() { showHomeScreen(); };
        } else {
            contactBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>Contact';
            contactBtn.onclick = function() { contactMusician(); };
            backBtn.innerHTML = 'Back';
            backBtn.onclick = function() { showHomeScreen(); };
        }

        // Store email for contact
        window.viewingMusicianEmail = profile.email;

    } catch (error) {
        console.error("Error loading profile:", error);
        alert('Error loading profile');
        showHomeScreen();
    }
}
window.viewMusicianProfile = viewMusicianProfile;

// Contact musician
function contactMusician() {
    if (window.viewingMusicianEmail) {
        window.location.href = `mailto:${window.viewingMusicianEmail}`;
    } else {
        alert('Contact information not available');
    }
}
window.contactMusician = contactMusician;

// ===== BAND SYSTEM =====

// Band photo storage
window.pendingBandPhoto = null;
window.currentBandId = null;

// Show My Bands screen
async function showMyBands() {
    if (!window.currentUser) {
        alert('Please sign in first');
        signInWithGoogleAndCheckProfile();
        return;
    }
    
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screenMyBands').classList.add('active');
    window.history.pushState({}, '', '/bands');
    
    // Update tab bar
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tabBands').classList.add('active');
    showTabBar();
    
    await loadMyBands();
}
window.showMyBands = showMyBands;

// Load user's bands
async function loadMyBands() {
    const container = document.getElementById('myBandsList');
    container.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';
    
    try {
        const userId = window.currentUser.uid;
        
        // Query bands where user is leader
        const leaderQuery = query(
            collection(db, "bands"),
            where("leaderId", "==", userId)
        );
        const leaderSnap = await getDocs(leaderQuery);
        
        // Query bands where user is temp admin
        const tempAdminQuery = query(
            collection(db, "bands"),
            where("tempAdminId", "==", userId)
        );
        const tempAdminSnap = await getDocs(tempAdminQuery);
        
        // Query bands where user is a member
        const memberQuery = query(
            collection(db, "bandMembers"),
            where("userId", "==", userId),
            where("status", "==", "accepted")
        );
        const memberSnap = await getDocs(memberQuery);
        
        let bands = [];
        
        // Add bands where user is leader
        leaderSnap.forEach(doc => {
            bands.push({ id: doc.id, ...doc.data(), role: 'leader' });
        });
        
        // Add bands where user is temp admin (avoid duplicates)
        tempAdminSnap.forEach(doc => {
            if (!bands.some(b => b.id === doc.id)) {
                const data = doc.data();
                bands.push({ id: doc.id, ...data, role: data.leaderStatus === 'pending' ? 'admin' : 'member' });
            }
        });
        
        // Add bands where user is member (fetch band details)
        for (const memberDoc of memberSnap.docs) {
            const bandId = memberDoc.data().bandId;
            // Skip if already added as leader/admin
            if (bands.some(b => b.id === bandId)) continue;
            
            const bandDoc = await getDoc(doc(db, "bands", bandId));
            if (bandDoc.exists()) {
                bands.push({ id: bandDoc.id, ...bandDoc.data(), role: 'member' });
            }
        }
        
        if (bands.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><circle cx="19" cy="7" r="3"/><path d="M19 21v-1a3 3 0 00-3-3h-1"/></svg></div>
                    <p>No bands yet</p>
                    <p style="color: #666; font-size: 13px;">Create a band to get started</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = bands.map(band => {
            const photoStyle = band.photoURL
                ? `background-image: url('${band.photoURL}')`
                : '';
            const photoPlaceholder = band.photoURL ? '' : `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/>
                    <circle cx="19" cy="7" r="3"/><path d="M19 21v-1a3 3 0 00-3-3h-1"/>
                </svg>`;
            return `
                <div class="band-card" onclick="showBandDetail('${band.id}')">
                    <div class="band-card-photo" style="${photoStyle}">${photoPlaceholder}</div>
                    <div class="band-card-content">
                        <div class="band-card-name">${escapeHtml(band.name)}</div>
                        <div class="band-card-info">
                            ${band.role === 'leader' ? 'Leader' : band.role === 'admin' ? 'Admin' : 'Member'}
                            ${band.memberCount ? ` • ${band.memberCount} members` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error("Error loading bands:", error);
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/></svg></div>
                <p>Error loading bands</p>
            </div>
        `;
    }
}

// Show Create Band screen
function showCreateBand() {
    // Show modal
    document.getElementById('createBandModal').classList.add('active');
    document.body.style.overflow = 'hidden';

    // Reset form
    document.getElementById('newBandName').value = '';
    document.getElementById('newBandBio').value = '';
    window.pendingBandPhoto = null;

    // Reset photo preview
    const photoPreview = document.getElementById('bandPhotoPreview');
    photoPreview.style.backgroundImage = '';
    photoPreview.classList.remove('has-photo');
    photoPreview.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><circle cx="19" cy="7" r="3"/><path d="M19 21v-1a3 3 0 00-3-3h-1"/></svg>';

    // Reset leader toggle
    document.querySelector('input[name="leaderType"][value="self"]').checked = true;
    document.getElementById('inviteLeaderFields').style.display = 'none';
    document.getElementById('inviteLeaderName').value = '';
    document.getElementById('inviteLeaderEmail').value = '';
    const leaderPhoneField = document.getElementById('inviteLeaderPhone');
    if (leaderPhoneField) leaderPhoneField.value = '';

    // Reset member inputs to default 3 rows
    document.getElementById('bandMemberInputs').innerHTML = `
        <div class="member-input-row">
            <input type="text" class="member-name-input" placeholder="Name">
            <input type="email" class="member-email-input" placeholder="Email">
            <input type="tel" class="member-phone-input" placeholder="Phone">
        </div>
        <div class="member-input-row">
            <input type="text" class="member-name-input" placeholder="Name">
            <input type="email" class="member-email-input" placeholder="Email">
            <input type="tel" class="member-phone-input" placeholder="Phone">
        </div>
        <div class="member-input-row">
            <input type="text" class="member-name-input" placeholder="Name">
            <input type="email" class="member-email-input" placeholder="Email">
            <input type="tel" class="member-phone-input" placeholder="Phone">
        </div>
    `;
}
window.showCreateBand = showCreateBand;

// Close Create Band modal
function closeCreateBandModal() {
    document.getElementById('createBandModal').classList.remove('active');
    document.body.style.overflow = '';
}
window.closeCreateBandModal = closeCreateBandModal;

// Toggle leader input fields
function toggleLeaderInput() {
    const leaderType = document.querySelector('input[name="leaderType"]:checked').value;
    const fields = document.getElementById('inviteLeaderFields');
    fields.style.display = leaderType === 'other' ? 'block' : 'none';
}
window.toggleLeaderInput = toggleLeaderInput;

// Handle band photo selection
async function handleBandPhotoSelect(event) {
    let file = event.target.files[0];
    if (!file) return;
    
    const preview = document.getElementById('bandPhotoPreview');
    preview.textContent = '⏳';
    
    // Show preview
    const reader = new FileReader();
    reader.onload = function(e) {
        preview.textContent = '';
        preview.style.backgroundImage = `url(${e.target.result})`;
        preview.classList.add('has-photo');
    };
    reader.readAsDataURL(file);
    
    window.pendingBandPhoto = file;
}
window.handleBandPhotoSelect = handleBandPhotoSelect;

// Add another member input row
function addMemberInputRow() {
    const container = document.getElementById('bandMemberInputs');
    const row = document.createElement('div');
    row.className = 'member-input-row';
    row.innerHTML = `
        <input type="text" class="member-name-input" placeholder="Name">
        <input type="email" class="member-email-input" placeholder="Email">
        <input type="tel" class="member-phone-input" placeholder="Phone">
    `;
    container.appendChild(row);
}
window.addMemberInputRow = addMemberInputRow;

// Collect members from input rows
function collectMembersFromInputs() {
    const members = [];
    const rows = document.querySelectorAll('#bandMemberInputs .member-input-row');

    rows.forEach(row => {
        const name = row.querySelector('.member-name-input').value.trim();
        const email = row.querySelector('.member-email-input').value.trim().toLowerCase();
        const phoneInput = row.querySelector('.member-phone-input');
        const phoneRaw = phoneInput ? phoneInput.value.trim() : '';
        const phone = phoneRaw ? normalizePhoneNumber(phoneRaw) : null;

        const hasValidEmail = email && email.includes('@');
        const hasValidPhone = phone && phone.startsWith('+1') && phone.length === 12;

        // Allow members with name + (email or phone or both)
        if (name && (hasValidEmail || hasValidPhone)) {
            members.push({
                name,
                email: hasValidEmail ? email : null,
                phone: hasValidPhone ? phone : null
            });
        }
    });

    return members;
}

// Upload band photo to Firebase Storage
async function uploadBandPhoto(bandId) {
    if (!window.pendingBandPhoto) return null;
    
    try {
        const file = window.pendingBandPhoto;
        const fileRef = window.storageRef(window.storage, `band-photos/${bandId}/${Date.now()}_${file.name}`);
        
        await uploadBytes(fileRef, file);
        const downloadURL = await getDownloadURL(fileRef);
        
        window.pendingBandPhoto = null;
        return downloadURL;
    } catch (error) {
        console.error("Error uploading band photo:", error);
        return null;
    }
}

// Save new band
async function saveBand() {
    const name = document.getElementById('newBandName').value.trim();
    const bio = document.getElementById('newBandBio').value.trim();
    
    if (!name) {
        alert('Please enter a band name');
        return;
    }
    
    if (!window.currentUser) {
        alert('Please sign in first');
        return;
    }
    
    // Check if inviting someone else as leader
    const leaderType = document.querySelector('input[name="leaderType"]:checked').value;
    const invitingLeader = leaderType === 'other';
    
    let invitedLeader = null;
    if (invitingLeader) {
        const leaderName = document.getElementById('inviteLeaderName').value.trim();
        const leaderEmail = document.getElementById('inviteLeaderEmail').value.trim().toLowerCase();
        
        if (!leaderName || !leaderEmail || !leaderEmail.includes('@')) {
            alert('Please enter the leader\'s name and email');
            return;
        }
        
        invitedLeader = { name: leaderName, email: leaderEmail };
    }
    
    const members = collectMembersFromInputs();
    
    try {
        // Create band document
        const bandData = {
            name,
            bio,
            photoURL: null,
            memberCount: invitingLeader ? members.length + 1 : members.length, // +1 for creator if inviting leader
            createdAt: serverTimestamp(),
            createdBy: window.currentUser.uid,
            createdByEmail: window.currentUser.email
        };
        
        if (invitingLeader) {
            // Invited leader - creator is temporary admin
            bandData.leaderId = null; // No leader yet
            bandData.leaderName = invitedLeader.name;
            bandData.leaderEmail = invitedLeader.email;
            bandData.leaderStatus = 'pending';
            bandData.tempAdminId = window.currentUser.uid;
            bandData.tempAdminEmail = window.currentUser.email;
        } else {
            // Creator is the leader
            bandData.leaderId = window.currentUser.uid;
            bandData.leaderName = window.currentUserProfile?.name || window.currentUser.displayName;
            bandData.leaderEmail = window.currentUser.email;
            bandData.leaderStatus = 'accepted';
        }
        
        const bandRef = await addDoc(collection(db, "bands"), bandData);
        
        // Upload band photo if selected
        if (window.pendingBandPhoto) {
            const photoURL = await uploadBandPhoto(bandRef.id);
            if (photoURL) {
                await updateDoc(doc(db, "bands", bandRef.id), { photoURL });
            }
        }
        
        // Send leader invite if inviting someone else
        if (invitingLeader) {
            await sendLeaderInviteEmail(invitedLeader.email, invitedLeader.name, name, bandRef.id);
            
            // Also add creator as a member (already accepted since they created it)
            await addDoc(collection(db, "bandMembers"), {
                bandId: bandRef.id,
                bandName: name,
                name: window.currentUserProfile?.name || window.currentUser.displayName,
                email: window.currentUser.email,
                status: 'accepted',
                userId: window.currentUser.uid,
                invitedAt: serverTimestamp(),
                invitedBy: window.currentUser.uid
            });
        }
        
        // Add members
        for (const member of members) {
            await addDoc(collection(db, "bandMembers"), {
                bandId: bandRef.id,
                bandName: name,
                name: member.name,
                email: member.email || null,
                phone: member.phone || null,
                status: 'pending',
                userId: null,
                invitedAt: serverTimestamp(),
                invitedBy: window.currentUser.uid
            });
        }

        console.log("Band created:", bandRef.id);
        closeCreateBandModal();

        // Open unified invite modal if there are members to invite
        if (members.length > 0) {
            // Pre-select all members for invite
            window.inviteState = window.inviteState || {};
            window.inviteState.preSelectedMembers = members;
            openUnifiedInviteModal('band', bandRef.id, { id: bandRef.id, name: name });
        } else {
            showBandDetail(bandRef.id);
        }

    } catch (error) {
        console.error("Error creating band:", error);
        alert("Error creating band: " + error.message);
    }
}
window.saveBand = saveBand;

// Send band invite email
async function sendBandInviteEmail(toEmail, toName, bandName, bandId) {
    try {
        const inviteUrl = `${window.location.origin}?joinBand=${bandId}`;
        
        await addDoc(collection(db, "mail"), {
            to: toEmail,
            message: {
                subject: `You're invited to join ${bandName} on Tempo`,
                html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">Hey ${toName}!</h2>
                        <p style="color: #555; font-size: 16px; line-height: 1.6;">
                            You've been invited to join <strong>${bandName}</strong> on Tempo - the easiest way to coordinate rehearsals.
                        </p>
                        <p style="margin: 30px 0;">
                            <a href="${inviteUrl}" style="background: #4a90e2; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 500; display: inline-block;">
                                Join ${bandName}
                            </a>
                        </p>
                        <p style="color: #888; font-size: 14px;">
                            Once you join, you'll be notified about upcoming gigs and can submit your availability for rehearsals.
                        </p>
                    </div>
                `
            }
        });
        console.log("Invite email queued for", toEmail);
    } catch (error) {
        console.error("Error sending invite email:", error);
    }
}

// Send leader invite email
async function sendLeaderInviteEmail(toEmail, toName, bandName, bandId) {
    try {
        const inviteUrl = `${window.location.origin}?leadBand=${bandId}`;
        
        await addDoc(collection(db, "mail"), {
            to: toEmail,
            message: {
                subject: `You're invited to lead ${bandName} on Tempo`,
                html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">Hey ${toName}!</h2>
                        <p style="color: #555; font-size: 16px; line-height: 1.6;">
                            You've been invited to <strong>lead ${bandName}</strong> on Tempo - the easiest way to coordinate rehearsals.
                        </p>
                        <p style="color: #555; font-size: 16px; line-height: 1.6;">
                            As band leader, you'll be able to:
                        </p>
                        <ul style="color: #555; font-size: 16px; line-height: 1.8;">
                            <li>Create and manage gigs</li>
                            <li>Add or remove band members</li>
                            <li>Send rehearsal schedules to the whole band</li>
                        </ul>
                        <p style="margin: 30px 0;">
                            <a href="${inviteUrl}" style="background: #4a90e2; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 500; display: inline-block;">
                                Accept & Lead ${bandName}
                            </a>
                        </p>
                    </div>
                `
            }
        });
        console.log("Leader invite email queued for", toEmail);
    } catch (error) {
        console.error("Error sending leader invite email:", error);
    }
}

// Show Band Detail screen
async function showBandDetail(bandId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screenBandDetail').classList.add('active');
    window.history.pushState({}, '', '/band/' + bandId);
    
    window.currentBandId = bandId;
    
    try {
        // Load band info
        const bandDoc = await getDoc(doc(db, "bands", bandId));
        if (!bandDoc.exists()) {
            alert('Band not found');
            showMyBands();
            return;
        }
        
        const band = bandDoc.data();
        window.currentBandData = band;
        const userId = window.currentUser?.uid;
        const isLeader = band.leaderId === userId;
        const isTempAdmin = band.tempAdminId === userId && band.leaderStatus === 'pending';
        const canManage = isLeader || isTempAdmin;
        
        document.getElementById('bandDetailName').textContent = band.name;
        
        // Show band photo
        const photoEl = document.getElementById('bandDetailPhoto');
        if (band.photoURL) {
            photoEl.style.backgroundImage = `url(${band.photoURL})`;
            photoEl.classList.add('has-photo');
            photoEl.textContent = '';
        } else {
            photoEl.style.backgroundImage = '';
            photoEl.classList.remove('has-photo');
            photoEl.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><circle cx="19" cy="7" r="3"/><path d="M19 21v-1a3 3 0 00-3-3h-1"/></svg>';
        }
        
        // Set share URL
        const shareUrl = `${window.location.origin}/b/${bandId}`;
        document.getElementById('bandShareUrl').textContent = shareUrl;
        window.currentBandShareUrl = shareUrl;
        
        // Show/hide share card based on role
        document.getElementById('bandShareCard').style.display = canManage ? 'block' : 'none';
        
        // Show role badge
        let roleText = 'Member';
        let roleClass = 'band-role-badge member';
        if (isLeader) {
            roleText = 'Leader';
            roleClass = 'band-role-badge';
        } else if (isTempAdmin) {
            roleText = 'Admin (until leader accepts)';
            roleClass = 'band-role-badge';
        }
        document.getElementById('bandDetailRole').textContent = roleText;
        document.getElementById('bandDetailRole').className = roleClass;
        
        // Show/hide add member button based on role
        document.getElementById('addMemberBtn').style.display = canManage ? 'block' : 'none';
        
        // Show/hide create gig button based on role
        document.getElementById('createGigForBandBtn').style.display = canManage ? 'block' : 'none';
        
        // Load members
        await loadBandMembers(bandId, canManage, band);
        
        // Load band gigs
        await loadBandGigs(bandId);
        
    } catch (error) {
        console.error("Error loading band:", error);
        alert("Error loading band");
        showMyBands();
    }
}
window.showBandDetail = showBandDetail;

// Copy band invite link
function copyBandLink() {
    navigator.clipboard.writeText(window.currentBandShareUrl).then(() => {
        const btn = document.getElementById('copyBandBtn');
        btn.textContent = 'Copied!';
        setTimeout(() => {
            btn.textContent = 'Copy Link';
        }, 2000);
    });
}
window.copyBandLink = copyBandLink;

// Share band to Messages
function shareBandToMessages() {
    const bandName = window.currentBandData?.name || 'the band';
    const text = `Join ${bandName} on Tempo! ${window.currentBandShareUrl}`;
    
    if (navigator.share) {
        navigator.share({
            title: `Join ${bandName}`,
            text: `You're invited to join ${bandName} on Tempo`,
            url: window.currentBandShareUrl
        }).catch(err => console.log('Share cancelled'));
    } else {
        // Fallback for desktop - open SMS
        window.location.href = `sms:&body=${encodeURIComponent(text)}`;
    }
}
window.shareBandToMessages = shareBandToMessages;

// Show band invite landing page
async function showBandInviteLanding(bandId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screenBandInvite').classList.add('active');
    
    window.pendingBandInviteId = bandId;
    
    try {
        const bandDoc = await getDoc(doc(db, "bands", bandId));
        
        if (!bandDoc.exists()) {
            alert('Band not found');
            showHomeScreen();
            return;
        }
        
        const band = bandDoc.data();
        
        // Show band info
        document.getElementById('inviteBandName').textContent = band.name;
        document.getElementById('inviteBandBio').textContent = band.bio || '';
        document.getElementById('inviteBandBio').style.display = band.bio ? 'block' : 'none';
        
        // Show band photo
        const photoEl = document.getElementById('inviteBandPhoto');
        if (band.photoURL) {
            photoEl.style.backgroundImage = `url(${band.photoURL})`;
            photoEl.classList.add('has-photo');
            photoEl.textContent = '';
        } else {
            photoEl.style.backgroundImage = '';
            photoEl.classList.remove('has-photo');
            photoEl.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><circle cx="19" cy="7" r="3"/><path d="M19 21v-1a3 3 0 00-3-3h-1"/></svg>';
        }
        
    } catch (error) {
        console.error("Error loading band invite:", error);
        alert('Error loading band');
        showHomeScreen();
    }
}
window.showBandInviteLanding = showBandInviteLanding;

// Handle join from band invite landing
async function handleBandInviteJoin() {
    const bandId = window.pendingBandInviteId;
    if (!bandId) return;
    
    // If not signed in, prompt sign in first
    if (!window.currentUser) {
        window.pendingBandJoin = bandId;
        await signInWithGoogleAndCheckProfile();
        return;
    }
    
    // If no profile, create one first
    if (!window.currentUserProfile) {
        window.pendingBandJoin = bandId;
        showProfileSetup();
        return;
    }
    
    // Join the band
    await joinBandFromInvite(bandId);
}
window.handleBandInviteJoin = handleBandInviteJoin;

// Join band from public invite link
async function joinBandFromInvite(bandId) {
    try {
        const bandDoc = await getDoc(doc(db, "bands", bandId));
        if (!bandDoc.exists()) {
            alert("Band not found");
            return;
        }
        
        const band = bandDoc.data();
        const userEmail = window.currentUser.email.toLowerCase();
        
        // Check if this person is the pending leader
        if (band.leaderStatus === 'pending' && band.leaderEmail?.toLowerCase() === userEmail) {
            // Make them the leader!
            await updateDoc(doc(db, "bands", bandId), {
                leaderId: window.currentUser.uid,
                leaderName: window.currentUserProfile?.name || window.currentUser.displayName,
                leaderStatus: 'accepted',
                leaderAcceptedAt: serverTimestamp()
            });
            
            alert(`You're now the leader of ${band.name}!`);
            window.history.replaceState({}, '', '/');
            showBandDetail(bandId);
            return;
        }
        
        // Check if already a member
        const existingQuery = query(
            collection(db, "bandMembers"),
            where("bandId", "==", bandId),
            where("userId", "==", window.currentUser.uid)
        );
        const existingSnap = await getDocs(existingQuery);
        
        if (!existingSnap.empty) {
            alert("You're already a member of this band!");
            window.history.replaceState({}, '', '/');
            showBandDetail(bandId);
            return;
        }
        
        // Check if this is the actual leader (already accepted)
        if (band.leaderId === window.currentUser.uid) {
            alert("You're already the leader of this band!");
            window.history.replaceState({}, '', '/');
            showBandDetail(bandId);
            return;
        }
        
        // Check if there's a pending invite for this email
        const inviteQuery = query(
            collection(db, "bandMembers"),
            where("bandId", "==", bandId),
            where("email", "==", userEmail)
        );
        const inviteSnap = await getDocs(inviteQuery);
        
        if (!inviteSnap.empty) {
            // Accept existing invite
            const inviteDoc = inviteSnap.docs[0];
            await updateDoc(doc(db, "bandMembers", inviteDoc.id), {
                status: 'accepted',
                userId: window.currentUser.uid,
                joinedAt: serverTimestamp()
            });
        } else {
            // Create new member record
            await addDoc(collection(db, "bandMembers"), {
                bandId: bandId,
                bandName: band.name,
                name: window.currentUserProfile?.name || window.currentUser.displayName,
                email: userEmail,
                status: 'accepted',
                userId: window.currentUser.uid,
                joinedAt: serverTimestamp(),
                joinedVia: 'invite_link'
            });
            
            // Update member count
            await updateDoc(doc(db, "bands", bandId), {
                memberCount: (band.memberCount || 0) + 1
            });
        }
        
        alert("You've joined the band!");
        window.history.replaceState({}, '', '/');
        showBandDetail(bandId);
        
    } catch (error) {
        console.error("Error joining band:", error);
        alert("Error joining band: " + error.message);
    }
}
window.joinBandFromInvite = joinBandFromInvite;

// Load band members
async function loadBandMembers(bandId, canManage, band) {
    const container = document.getElementById('bandMembersDisplay');
    
    try {
        const membersQuery = query(
            collection(db, "bandMembers"),
            where("bandId", "==", bandId)
        );
        const membersSnap = await getDocs(membersQuery);
        
        let html = '';

        // Get leader's phone - first check band document, then user profile
        let leaderPhone = band.leaderPhone || null;
        if (!leaderPhone && band.leaderId) {
            try {
                const leaderDoc = await getDoc(doc(db, "users", band.leaderId));
                if (leaderDoc.exists()) {
                    leaderPhone = leaderDoc.data().phone || null;
                }
            } catch (e) {
                console.log("Could not fetch leader profile");
            }
        }

        const leaderHasEmail = band.leaderEmail && band.leaderEmail.includes('@');
        const leaderHasPhone = leaderPhone && leaderPhone.length >= 10;

        // Build leader channel badges
        let leaderBadges = '';
        if (leaderHasEmail) leaderBadges += '<span class="channel-badge email">Email</span>';
        if (leaderHasPhone) leaderBadges += '<span class="channel-badge sms">SMS</span>';

        // Add phone button for leader - any member can add it (stores on band document)
        const leaderAddPhoneBtn = (!leaderHasPhone && window.currentUser && band.leaderId)
            ? `<button class="text-blast-add-phone-btn" onclick="event.stopPropagation(); openLeaderEditPhone('${bandId}', '${escapeHtml(band.leaderName || 'Leader').replace(/'/g, "\\'")}')">+ Add phone</button>`
            : '';

        // Show leader (or pending leader)
        const leaderStatus = band.leaderStatus === 'pending' ? 'Pending Leader' : 'Leader';
        const leaderStatusClass = band.leaderStatus === 'pending' ? 'pending' : 'accepted';

        html += `
            <div class="member-item">
                <div class="member-info">
                    <div class="member-name">${escapeHtml(band.leaderName || 'Leader')}</div>
                    <div class="member-contact-row">
                        ${leaderBadges}
                        ${leaderAddPhoneBtn}
                    </div>
                </div>
                <span class="member-status ${leaderStatusClass}">${leaderStatus}</span>
            </div>
        `;
        
        membersSnap.forEach(docSnap => {
            const member = docSnap.data();
            const hasEmail = member.email && member.email.includes('@');
            const hasPhone = member.phone && member.phone.length >= 10;

            // Build channel badges
            let channelBadges = '';
            if (hasEmail) channelBadges += '<span class="channel-badge email">Email</span>';
            if (hasPhone) channelBadges += '<span class="channel-badge sms">SMS</span>';

            // Add phone button if no phone - any authenticated member can add phone for text blasts
            const addPhoneBtn = (!hasPhone && window.currentUser)
                ? `<button class="text-blast-add-phone-btn" onclick="event.stopPropagation(); openBandDetailEditPhone('${docSnap.id}', '${escapeHtml(member.name).replace(/'/g, "\\'")}', '${escapeHtml(member.phone || '').replace(/'/g, "\\'")}')">+ Add phone</button>`
                : '';

            html += `
                <div class="member-item">
                    <div class="member-info">
                        <div class="member-name">${escapeHtml(member.name)}</div>
                        <div class="member-contact-row">
                            ${channelBadges}
                            ${addPhoneBtn}
                        </div>
                    </div>
                    <span class="member-status ${member.status}">${member.status === 'accepted' ? 'Joined' : 'Pending'}</span>
                    ${canManage ? `<button class="member-remove" onclick="event.stopPropagation(); removeBandMember('${docSnap.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}
                </div>
            `;
        });
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error("Error loading members:", error);
        container.innerHTML = '<p style="color: #e74c3c;">Error loading members</p>';
    }
}

// Load band gigs
async function loadBandGigs(bandId) {
    const container = document.getElementById('bandGigsList');
    
    try {
        const gigsQuery = query(
            collection(db, "gigs"),
            where("bandId", "==", bandId)
        );
        const gigsSnap = await getDocs(gigsQuery);
        
        if (gigsSnap.empty) {
            container.innerHTML = '<p style="color: #666; font-size: 14px;">No gigs yet</p>';
            return;
        }
        
        let html = '';
        gigsSnap.forEach(doc => {
            const gig = doc.data();
            html += `
                <div class="band-card" onclick="window.location.href='?leader=${doc.id}'">
                    <div class="band-card-name">${escapeHtml(gig.venue || 'Unnamed Gig')}</div>
                    <div class="band-card-info">${gig.showDate || ''}</div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error("Error loading gigs:", error);
    }
}

// Show add member modal
function showAddMemberModal() {
    const name = prompt("Enter member's name:");
    if (!name) return;
    
    const email = prompt("Enter member's email:");
    if (!email || !email.includes('@')) {
        alert('Please enter a valid email');
        return;
    }
    
    addMemberToBand(name, email);
}
window.showAddMemberModal = showAddMemberModal;

// Add member to existing band
async function addMemberToBand(name, email) {
    if (!window.currentBandId) return;
    
    try {
        const bandDoc = await getDoc(doc(db, "bands", window.currentBandId));
        const band = bandDoc.data();
        
        await addDoc(collection(db, "bandMembers"), {
            bandId: window.currentBandId,
            bandName: band.name,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            status: 'pending',
            userId: null,
            invitedAt: serverTimestamp(),
            invitedBy: window.currentUser.uid
        });
        
        // Update member count
        await updateDoc(doc(db, "bands", window.currentBandId), {
            memberCount: (band.memberCount || 0) + 1
        });
        
        // Send invite email
        await sendBandInviteEmail(email.trim().toLowerCase(), name.trim(), band.name, window.currentBandId);
        
        // Reload members
        await loadBandMembers(window.currentBandId, true);
        
    } catch (error) {
        console.error("Error adding member:", error);
        alert("Error adding member: " + error.message);
    }
}

// Remove band member
async function removeBandMember(memberId) {
    if (!confirm('Remove this member from the band?')) return;
    
    try {
        await deleteDoc(doc(db, "bandMembers", memberId));
        
        // Update member count
        const bandDoc = await getDoc(doc(db, "bands", window.currentBandId));
        const band = bandDoc.data();
        await updateDoc(doc(db, "bands", window.currentBandId), {
            memberCount: Math.max(0, (band.memberCount || 1) - 1)
        });
        
        // Reload members
        await loadBandMembers(window.currentBandId, true);
        
    } catch (error) {
        console.error("Error removing member:", error);
        alert("Error removing member");
    }
}
window.removeBandMember = removeBandMember;

// Create gig for current band
function createGigForBand() {
    // Verify user can create gigs for this band
    const band = window.currentBandData;
    const userId = window.currentUser?.uid;
    const isLeader = band?.leaderId === userId;
    const isTempAdmin = band?.tempAdminId === userId && band?.leaderStatus === 'pending';
    
    if (!isLeader && !isTempAdmin) {
        alert('You do not have permission to create gigs for this band.');
        return;
    }
    
    window.selectedBandForGig = window.currentBandId;
    startNewGig();
}
window.createGigForBand = createGigForBand;

// Check for band invite on page load
async function checkBandInvite() {
    const urlParams = new URLSearchParams(window.location.search);
    const joinBandId = urlParams.get('joinBand');
    
    if (!joinBandId) return;
    
    // Clear the URL param
    window.history.replaceState({}, '', '/');
    
    if (!window.currentUser) {
        // Store for after sign in
        window.pendingBandJoin = joinBandId;
        alert('Please sign in to join the band');
        signInWithGoogleAndCheckProfile();
        return;
    }
    
    await joinBand(joinBandId);
}

// Join a band
async function joinBand(bandId) {
    try {
        // Find the member record for this user's email
        const memberQuery = query(
            collection(db, "bandMembers"),
            where("bandId", "==", bandId),
            where("email", "==", window.currentUser.email.toLowerCase())
        );
        const memberSnap = await getDocs(memberQuery);
        
        if (memberSnap.empty) {
            alert("No invitation found for your email address");
            return;
        }
        
        // Update member status
        const memberDoc = memberSnap.docs[0];
        await updateDoc(doc(db, "bandMembers", memberDoc.id), {
            status: 'accepted',
            userId: window.currentUser.uid,
            joinedAt: serverTimestamp()
        });
        
        alert("You've joined the band!");
        showBandDetail(bandId);
        
    } catch (error) {
        console.error("Error joining band:", error);
        alert("Error joining band: " + error.message);
    }
}
window.joinBand = joinBand;

// Accept leader role for a band
async function acceptLeaderRole(bandId) {
    try {
        const bandDoc = await getDoc(doc(db, "bands", bandId));
        
        if (!bandDoc.exists()) {
            alert("Band not found");
            return;
        }
        
        const band = bandDoc.data();
        
        // Verify this user's email matches the invited leader
        if (band.leaderEmail?.toLowerCase() !== window.currentUser.email.toLowerCase()) {
            alert("This invitation was sent to a different email address");
            return;
        }
        
        // Update band with new leader
        await updateDoc(doc(db, "bands", bandId), {
            leaderId: window.currentUser.uid,
            leaderName: window.currentUserProfile?.name || window.currentUser.displayName,
            leaderStatus: 'accepted',
            leaderAcceptedAt: serverTimestamp()
        });
        
        alert(`You're now the leader of ${band.name}!`);
        showBandDetail(bandId);
        
    } catch (error) {
        console.error("Error accepting leader role:", error);
        alert("Error accepting leader role: " + error.message);
    }
}
window.acceptLeaderRole = acceptLeaderRole;

// Notify band members of new gig
async function notifyBandMembersOfGig(bandId, gigId, gigData) {
    try {
        // Get all band members
        const membersQuery = query(
            collection(db, "bandMembers"),
            where("bandId", "==", bandId)
        );
        const membersSnap = await getDocs(membersQuery);
        
        const gigUrl = `${window.location.origin}/e/${gigId}`;
        const formattedDate = gigData.showDate ? new Date(gigData.showDate).toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric' 
        }) : 'TBD';
        
        // Send email to each member
        for (const memberDoc of membersSnap.docs) {
            const member = memberDoc.data();
            
            await addDoc(collection(db, "mail"), {
                to: member.email,
                message: {
                    subject: `New Gig: ${gigData.bandName} at ${gigData.venue}`,
                    html: `
                        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #333;">Hey ${member.name}!</h2>
                            <p style="color: #555; font-size: 16px; line-height: 1.6;">
                                A new gig has been scheduled for <strong>${gigData.bandName}</strong>!
                            </p>
                            
                            <div style="background: #f8f8f8; border-radius: 12px; padding: 20px; margin: 20px 0;">
                                <p style="margin: 0 0 8px; color: #333;"><strong>Venue:</strong> ${gigData.venue}</p>
                                <p style="margin: 0 0 8px; color: #333;"><strong>Date:</strong> ${formattedDate}</p>
                                ${gigData.setTime ? `<p style="margin: 0; color: #333;"><strong>Set Time:</strong> ${gigData.setTime}</p>` : ''}
                            </div>
                            
                            <p style="margin: 30px 0;">
                                <a href="${gigUrl}" style="background: #4a90e2; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 500; display: inline-block;">
                                    View Gig & Submit Availability
                                </a>
                            </p>
                            
                            <p style="color: #888; font-size: 14px;">
                                Click the button above to see full details and submit your rehearsal availability.
                            </p>
                        </div>
                    `
                }
            });
        }
        
        console.log(`Notified ${membersSnap.size} band members of new gig`);
        
    } catch (error) {
        console.error("Error notifying band members:", error);
    }
}
window.notifyBandMembersOfGig = notifyBandMembersOfGig;

// ===== END BAND SYSTEM =====

// ===== END PROFILE SYSTEM =====

console.log("Firebase initialized successfully!");

// Check URL params for different views
const urlParams = new URLSearchParams(window.location.search);
const gigId = urlParams.get('gig');
const leaderGigId = urlParams.get('leader');
const eventGigId = urlParams.get('event');
const joinBandId = urlParams.get('joinBand');
const leadBandId = urlParams.get('leadBand');
const bandLandingId = urlParams.get('band');
const calendarConnected = urlParams.get('calendarConnected');
const calendarError = urlParams.get('calendarError');
const editProfile = urlParams.get('editProfile');

// Handle calendar OAuth return
if (calendarConnected === 'true') {
    window.history.replaceState({}, '', '/');
    window.pendingCalendarSuccess = true;
}
if (calendarError) {
    window.history.replaceState({}, '', '/');
    alert('Could not connect calendar: ' + calendarError);
}
if (editProfile === '1') {
    window.history.replaceState({}, '', '/');
    window.pendingEditProfile = true;
}

// Handle ?band= parameter (from OG redirect)
if (bandLandingId) {
    const screenFeed = document.getElementById('screenFeed');
    if (screenFeed) screenFeed.classList.remove('active');
    showGlobalHeader();
    showBandInviteLanding(bandLandingId);
}

// Check for /b/{bandId} path (band invite link)
const pathMatch = window.location.pathname.match(/^\/b\/([a-zA-Z0-9]+)$/);
const bandInviteId = pathMatch ? pathMatch[1] : null;

// Check for /band/{bandId} path (view band detail)
const bandDetailMatch = window.location.pathname.match(/^\/band\/([a-zA-Z0-9]+)$/);
const bandDetailId = bandDetailMatch ? bandDetailMatch[1] : null;

// Check for /bands path
const isBandsPage = window.location.pathname === '/bands';

// Check for /profile path (view own profile)
const isProfilePage = window.location.pathname === '/profile';

// Check for /edit-profile path
const isEditProfilePage = window.location.pathname === '/edit-profile';

// Check for /musician/{id} path
const musicianMatch = window.location.pathname.match(/^\/musician\/([a-zA-Z0-9]+)$/);
const musicianId = musicianMatch ? musicianMatch[1] : null;

// Check for /gigs path (legacy - redirect to schedule)
const isGigsPage = window.location.pathname === '/gigs';

// Check for /schedule path
const isSchedulePage = window.location.pathname === '/schedule';

// Check for /new-rehearsal path
const isNewRehearsalPage = window.location.pathname === '/new-rehearsal';

// Check for /r/{rehearsalId} path
const rehearsalMatch = window.location.pathname.match(/^\/r\/([a-zA-Z0-9]+)$/);
const rehearsalId = rehearsalMatch ? rehearsalMatch[1] : null;

// Helper to hide feed screen
function hideFeedScreen() {
    const screenFeed = document.getElementById('screenFeed');
    if (screenFeed) screenFeed.classList.remove('active');
}

// Route to appropriate view
if (isBandsPage) {
    // Will be handled after auth
    window.pendingShowBands = true;
} else if (isProfilePage) {
    // Will be handled after auth - view own profile
    window.pendingViewProfile = true;
} else if (isEditProfilePage) {
    // Will be handled after auth - edit profile
    window.pendingEditProfile = true;
} else if (musicianId) {
    // Will be handled after auth - view other musician
    window.pendingViewMusician = musicianId;
} else if (isGigsPage || isSchedulePage) {
    // Will be handled after auth - both go to schedule now
    window.pendingShowSchedule = true;
} else if (isNewRehearsalPage) {
    // Will be handled after auth
    window.pendingNewRehearsal = true;
} else if (rehearsalId) {
    // Show rehearsal detail directly (like gigs)
    hideFeedScreen();
    showGlobalHeader();
    showRehearsalDetail(rehearsalId);
} else if (bandDetailId) {
    // Will be handled after auth
    window.pendingBandDetail = bandDetailId;
} else if (bandInviteId) {
    // Band invite via /b/ path - show landing page
    hideFeedScreen();
    showGlobalHeader();
    showBandInviteLanding(bandInviteId);
} else if (joinBandId) {
    // Band invite - will be handled after auth
    window.pendingBandJoin = joinBandId;
    // Clear URL param
    window.history.replaceState({}, '', '/');
} else if (leadBandId) {
    // Leader invite - will be handled after auth
    window.pendingLeaderAccept = leadBandId;
    // Clear URL param
    window.history.replaceState({}, '', '/');
} else if (eventGigId) {
    // Event card view (shareable confirmation page)
    hideFeedScreen();
    showGlobalHeader();
    loadEventCard(eventGigId);
} else if (leaderGigId) {
    // Leader dashboard view
    hideFeedScreen();
    document.getElementById('screen6').classList.add('active');
    window.currentGigId = leaderGigId;
    loadDashboard(leaderGigId);
} else if (gigId) {
    // Musician availability view
    hideFeedScreen();
    showGlobalHeader();
    loadGig(gigId);
}
// else: show default creation flow (screen1)

async function loadGig(gigId) {
    try {
        const gigRef = doc(db, "gigs", gigId);
        const gigSnap = await getDoc(gigRef);
        
        if (gigSnap.exists()) {
            const gig = gigSnap.data();
            window.currentGig = gig;
            window.currentGigId = gigId;
            
            // Populate musician view
            document.getElementById('musicianBand').textContent = gig.bandName;
            document.getElementById('musicianVenue').textContent = gig.venue;
            document.getElementById('musicianDate').textContent = formatDate(gig.showDate);
            document.getElementById('musicianLoadIn').textContent = formatTime(gig.loadIn);
            document.getElementById('musicianSetTime').textContent = formatTime(gig.setTime);
            document.getElementById('musicianSetLength').textContent = gig.setLength + ' min';
            
            if (gig.notes) {
                document.getElementById('musicianNotes').textContent = gig.notes;
                document.getElementById('notesCard').style.display = 'block';
            }
            
            // Show rehearsal location
            if (gig.rehearsalLocation) {
                document.getElementById('musicianRehearsalLocation').textContent = gig.rehearsalLocation;
                document.getElementById('rehearsalLocationCard').style.display = 'block';
            }
            
            // Show flyer if there's a show graphic
            if (gig.showGraphic && gig.showGraphic.url) {
                document.getElementById('flyerImage').src = gig.showGraphic.url;
                document.getElementById('flyerCard').style.display = 'block';
            }
            
            // Show other files
            if ((gig.files && gig.files.length > 0) || gig.streamingLink) {
                document.getElementById('musicianFilesCard').style.display = 'block';
                const filesDiv = document.getElementById('musicianFiles');
                filesDiv.innerHTML = '';
                
                if (gig.files) {
                    gig.files.forEach(file => {
                        if (file.type === 'audio') {
                            // Create audio player for audio files
                            const el = document.createElement('div');
                            el.className = 'audio-file-player';
                            el.innerHTML = `
                                <div class="audio-file-name">${file.name}</div>
                                <audio controls src="${file.url}" crossorigin="anonymous" preload="metadata"></audio>
                                <a class="audio-download-link" href="${file.url}" target="_blank">↓ Download</a>
                            `;
                            filesDiv.appendChild(el);
                        } else {
                            let icon = '📄';
                            if (file.type === 'pdf') icon = '📑';
                            
                            const el = document.createElement('a');
                            el.className = 'musician-file';
                            el.href = file.url;
                            el.target = '_blank';
                            el.innerHTML = `
                                <div class="musician-file-icon">${icon}</div>
                                <div class="musician-file-name">${file.name}</div>
                            `;
                            filesDiv.appendChild(el);
                        }
                    });
                }
            }
            
            // Show streaming link
            if (gig.streamingLink) {
                document.getElementById('musicianFilesCard').style.display = 'block';
                const streamLink = document.getElementById('musicianStreamingLink');
                streamLink.href = gig.streamingLink;
                streamLink.style.display = 'flex';
            }
            
            document.getElementById('rehearsalHelper').textContent = 
                `Band needs ${gig.rehearsalsNeeded} rehearsal(s). Select all times that work.`;
            
            // Build availability slots
            const slotsContainer = document.getElementById('availabilitySlots');
            slotsContainer.innerHTML = '';
            
            gig.suggestedTimes.forEach((slot, index) => {
                const slotEl = document.createElement('div');
                slotEl.className = 'availability-slot';
                slotEl.dataset.index = index;
                slotEl.onclick = function() { toggleSlot(this); };
                
                const responses = slot.responses || [];
                const responseHtml = responses.length > 0 
                    ? responses.map(r => `<span>${r.name}</span>`).join('') 
                    : '<span style="opacity:0.5">No responses yet</span>';
                
                slotEl.innerHTML = `
                    <div class="slot-info">
                        <div class="slot-date">${formatDate(slot.date)}</div>
                        <div class="slot-time">${formatTime(slot.time)}</div>
                        <div class="slot-responses">${responseHtml}</div>
                    </div>
                    <div class="slot-check"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20,6 9,17 4,12"/></svg></div>
                `;
                slotsContainer.appendChild(slotEl);
            });
            
            // Show musician view
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById('screen4').classList.add('active');
            
            // Set calendar to show month
            window.calendarDate = new Date(gig.showDate + 'T00:00:00');
            window.calendarDate.setDate(1);
            renderCalendar();
            renderAvailabilitySlots();
            
            // Hide name/instrument fields if user is signed in (still set values for submission)
            if (window.currentUser) {
                // Hide the card
                document.getElementById('yourInfoCard').style.display = 'none';
                
                // Still set values for form submission
                const name = window.currentUserProfile?.name || window.currentUser.displayName;
                if (name) {
                    document.getElementById('yourName').value = name;
                }
                
                const instruments = window.currentUserProfile?.instruments;
                if (instruments && instruments.length > 0) {
                    const primaryInstrument = instruments[0];
                    const instrumentMap = {
                        'vocals': 'Lead Vocals',
                        'guitar': 'Guitar',
                        'bass': 'Bass',
                        'drums': 'Drums',
                        'keys': 'Keys',
                        'saxophone': 'Saxophone',
                        'trumpet': 'Trumpet'
                    };
                    document.getElementById('yourInstrument').value = instrumentMap[primaryInstrument] || 'Other';
                }
            } else {
                // Show card for non-signed-in users
                document.getElementById('yourInfoCard').style.display = 'block';
            }
            
        } else {
            alert("Gig not found!");
        }
    } catch (error) {
        console.error("Error loading gig:", error);
        alert("Error loading gig: " + error.message);
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(timeStr) {
    if (!timeStr) return '-';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

window.loadGig = loadGig;
window.formatDate = formatDate;
window.formatTime = formatTime;

// Calendar state
window.calendarDate = new Date();
window.selectedTimes = [];
window.customTimes = [];
window.currentSelectedDay = null;

// ============================================
// DISCOVERY FEED & NEW HOME FUNCTIONALITY
// ============================================

// Tab navigation
function switchTab(tab) {
    // Close create sheet if open
    closeCreateSheet();

    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const tabBtn = document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (tabBtn) tabBtn.classList.add('active');

    // Handle tab action
    switch(tab) {
        case 'feed':
            showFeedHome();
            break;
        case 'bands':
            showBandsScreen();
            break;
        case 'profile':
            showOwnProfile();
            break;
    }
}
window.switchTab = switchTab;

// Home screen — shows upcoming events + your bands
function showFeedHome() {
    showBandsScreen();
    window.history.replaceState({}, '', '/');
}
window.showFeedHome = showFeedHome;

// Show bands screen (combined bands + schedule)
function showBandsScreen() {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = '';
    });
    const screenBands = document.getElementById('screenBands');
    if (screenBands) {
        screenBands.classList.add('active');
        screenBands.style.display = 'block';
    }
    showGlobalHeader();
    document.body.classList.remove('hide-tab-bar');
    const tabBar = document.getElementById('bottomTabBar');
    if (tabBar) tabBar.style.display = 'flex';

    // Update URL
    window.history.replaceState({}, '', '/bands');

    // Load bands screen content
    loadBandsScreen();
}
window.showBandsScreen = showBandsScreen;

// Load bands screen content
async function loadBandsScreen() {
    const upcomingList = document.getElementById('bandsUpcomingList');
    const bandsList = document.getElementById('bandsList');
    const signInPrompt = document.getElementById('bandsSignInPrompt');

    // If not signed in, show sign in prompt
    if (!window.currentUser) {
        if (upcomingList) upcomingList.innerHTML = '';
        if (bandsList) bandsList.innerHTML = '';
        if (signInPrompt) signInPrompt.style.display = 'block';
        return;
    }

    if (signInPrompt) signInPrompt.style.display = 'none';

    // Load upcoming events and bands in parallel
    await Promise.all([
        loadBandsUpcoming(),
        loadBandsList()
    ]);
}
window.loadBandsScreen = loadBandsScreen;

// Load upcoming gigs and rehearsals for bands screen
async function loadBandsUpcoming() {
    const container = document.getElementById('bandsUpcomingList');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const userId = window.currentUser.uid;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get user's bands first
        const membershipQuery = query(
            collection(db, "bandMembers"),
            where("userId", "==", userId)
        );
        const membershipSnap = await getDocs(membershipQuery);
        const bandIds = membershipSnap.docs.map(d => d.data().bandId);

        // Also get bands where user is the leader
        const leaderQuery = query(
            collection(db, "bands"),
            where("leaderId", "==", userId)
        );
        const leaderSnap = await getDocs(leaderQuery);
        leaderSnap.docs.forEach(d => {
            if (!bandIds.includes(d.id)) bandIds.push(d.id);
        });

        if (bandIds.length === 0) {
            container.innerHTML = '<div class="bands-empty-state">No upcoming events. Create a gig or join a band to get started.</div>';
            return;
        }

        // Get gigs for user's bands
        const gigsQuery = query(
            collection(db, "gigs"),
            where("createdBy", "==", userId)
        );
        const gigsSnap = await getDocs(gigsQuery);

        // Get rehearsals for user's bands
        const rehearsalsQuery = query(
            collection(db, "rehearsals"),
            where("createdBy", "==", userId)
        );
        const rehearsalsSnap = await getDocs(rehearsalsQuery);

        const events = [];

        // Process gigs
        gigsSnap.forEach(doc => {
            const gig = { id: doc.id, type: 'gig', ...doc.data() };
            const gigDate = new Date(gig.showDate + 'T00:00:00');
            if (gigDate >= today) {
                events.push({
                    ...gig,
                    date: gigDate,
                    title: gig.venue || gig.bandName,
                    subtitle: gig.bandName
                });
            }
        });

        // Process rehearsals
        rehearsalsSnap.forEach(doc => {
            const rehearsal = { id: doc.id, type: 'rehearsal', ...doc.data() };
            // Get the earliest confirmed time or first suggested time
            let rehearsalDate = null;
            if (rehearsal.confirmedTime) {
                rehearsalDate = rehearsal.confirmedTime.toDate ? rehearsal.confirmedTime.toDate() : new Date(rehearsal.confirmedTime);
            } else if (rehearsal.suggestedTimes && rehearsal.suggestedTimes.length > 0) {
                const firstTime = rehearsal.suggestedTimes[0];
                rehearsalDate = firstTime.toDate ? firstTime.toDate() : new Date(firstTime);
            }
            if (rehearsalDate && rehearsalDate >= today) {
                events.push({
                    ...rehearsal,
                    date: rehearsalDate,
                    title: 'Rehearsal' + (rehearsal.location ? ` @ ${rehearsal.location}` : ''),
                    subtitle: rehearsal.bandName || 'Practice'
                });
            }
        });

        // Sort by date
        events.sort((a, b) => a.date - b.date);

        if (events.length === 0) {
            container.innerHTML = '<div class="bands-empty-state">No upcoming events</div>';
            return;
        }

        // Render events (limit to 5)
        const displayEvents = events.slice(0, 5);
        container.innerHTML = displayEvents.map(event => {
            const dateStr = event.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const timeStr = event.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const icon = event.type === 'gig'
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

            const onclick = event.type === 'gig'
                ? `openGig('${event.id}', 'viewer')`
                : `showRehearsalDetail('${event.id}')`;

            return `
                <div class="bands-event-card" onclick="${onclick}">
                    <div class="bands-event-icon">${icon}</div>
                    <div class="bands-event-info">
                        <div class="bands-event-title">${escapeHtml(event.title)}</div>
                        <div class="bands-event-subtitle">${escapeHtml(event.subtitle)}</div>
                    </div>
                    <div class="bands-event-date">
                        <div class="bands-event-date-day">${dateStr}</div>
                        <div class="bands-event-date-time">${timeStr}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Add "View All" link if more than 5
        if (events.length > 5) {
            container.innerHTML += `<button class="bands-view-all-btn" onclick="showMySchedule()">View all ${events.length} events</button>`;
        }

    } catch (error) {
        console.error("Error loading upcoming events:", error);
        container.innerHTML = '<div class="bands-empty-state">Error loading events</div>';
    }
}
window.loadBandsUpcoming = loadBandsUpcoming;

// Load bands list for bands screen
async function loadBandsList() {
    const container = document.getElementById('bandsList');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const userId = window.currentUser.uid;

        // Get bands where user is a member
        const membershipQuery = query(
            collection(db, "bandMembers"),
            where("userId", "==", userId)
        );
        const membershipSnap = await getDocs(membershipQuery);

        const bands = [];

        // Get band details for each membership
        for (const memberDoc of membershipSnap.docs) {
            const membership = memberDoc.data();
            const bandDoc = await getDoc(doc(db, "bands", membership.bandId));
            if (bandDoc.exists()) {
                bands.push({
                    id: bandDoc.id,
                    ...bandDoc.data(),
                    role: membership.role
                });
            }
        }

        // Also get bands where user is the leader
        const leaderQuery = query(
            collection(db, "bands"),
            where("leaderId", "==", userId)
        );
        const leaderSnap = await getDocs(leaderQuery);
        leaderSnap.docs.forEach(d => {
            if (!bands.find(b => b.id === d.id)) {
                bands.push({
                    id: d.id,
                    ...d.data(),
                    role: 'leader'
                });
            }
        });

        if (bands.length === 0) {
            container.innerHTML = '<div class="bands-empty-state">No bands yet. Create or join a band!</div>';
            return;
        }

        // Sort by name
        bands.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        container.innerHTML = bands.map(band => {
            const roleLabel = band.role === 'leader' ? 'Leader' : band.role === 'admin' ? 'Admin' : 'Member';
            const photoStyle = band.photoURL
                ? `background-image: url('${band.photoURL}')`
                : 'background-color: #333';

            return `
                <div class="bands-band-card" onclick="showBandDetail('${band.id}')">
                    <div class="bands-band-photo" style="${photoStyle}"></div>
                    <div class="bands-band-info">
                        <div class="bands-band-name">${escapeHtml(band.name)}</div>
                        <div class="bands-band-role">${roleLabel}</div>
                    </div>
                    <div class="bands-band-arrow">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Error loading bands:", error);
        container.innerHTML = '<div class="bands-empty-state">Error loading bands</div>';
    }
}
window.loadBandsList = loadBandsList;




// Create sheet functions
function openCreateSheet() {
    document.getElementById('createSheetOverlay').classList.add('visible');
    document.getElementById('createSheet').classList.add('visible');
}
window.openCreateSheet = openCreateSheet;

function closeCreateSheet() {
    document.getElementById('createSheetOverlay').classList.remove('visible');
    document.getElementById('createSheet').classList.remove('visible');

    // Reset the Create tab to not be active (feed should be)
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const tabFeed = document.getElementById('tabFeed');
    if (tabFeed) tabFeed.classList.add('active');
}
window.closeCreateSheet = closeCreateSheet;

// Update showMyGigs to update tab bar
const originalShowMyGigs = window.showMyGigs;
// Note: showMyGigs is in app-legacy.js, we'll handle tab update there

// Update showMyBands to update tab bar
const originalShowMyBands = window.showMyBands;
// Note: showMyBands is in app-module.js already

// Hide tab bar for certain screens
function hideTabBar() {
    document.body.classList.add('hide-tab-bar');
}
window.hideTabBar = hideTabBar;

function showTabBar() {
    document.body.classList.remove('hide-tab-bar');
    document.getElementById('bottomTabBar').style.display = 'flex';
}
window.showTabBar = showTabBar;

// ============================================
// TAG INPUT HANDLING
// ============================================

window.genreTags = [];

function handleTagInput(event, type) {
    const input = event.target;
    const value = input.value.trim();
    
    // Add tag on Enter or comma
    if ((event.key === 'Enter' || event.key === ',') && value) {
        event.preventDefault();
        
        // Remove comma if typed
        const tagValue = value.replace(/,/g, '').trim();
        
        if (tagValue && type === 'genre') {
            if (!window.genreTags.includes(tagValue)) {
                window.genreTags.push(tagValue);
                renderTags('genre');
            }
        }
        
        input.value = '';
    }
    
    // Remove last tag on backspace if input is empty
    if (event.key === 'Backspace' && !value) {
        if (type === 'genre' && window.genreTags.length > 0) {
            window.genreTags.pop();
            renderTags('genre');
        }
    }
}
window.handleTagInput = handleTagInput;

function renderTags(type) {
    let tags, container;
    
    if (type === 'genre') {
        tags = window.genreTags || [];
        container = document.getElementById('genreTagsContainer');
    }
    
    if (!container) return;
    
    container.innerHTML = tags.map((tag, index) => `
        <span class="tag">
            ${escapeHtml(tag)}
            <span class="tag-remove" onclick="removeTag('${type}', ${index})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>
        </span>
    `).join('');
}
window.renderTags = renderTags;

function removeTag(type, index) {
    if (type === 'genre') {
        window.genreTags.splice(index, 1);
        renderTags('genre');
    }
}
window.removeTag = removeTag;

// Render social links as icon buttons
function renderSocialLinks(links) {
    const socialIcons = {
        instagram: {
            url: (val) => val.startsWith('http') ? val : `https://instagram.com/${val.replace('@', '')}`,
            svg: `<svg viewBox="0 0 24 24" fill="#E4405F"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`
        },
        spotify: {
            url: (val) => val.startsWith('http') ? val : `https://open.spotify.com/artist/${val}`,
            svg: `<svg viewBox="0 0 24 24" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`
        },
        youtube: {
            url: (val) => val.startsWith('http') ? val : `https://youtube.com/${val}`,
            svg: `<svg viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`
        },
        bandcamp: {
            url: (val) => val.startsWith('http') ? val : `https://${val}.bandcamp.com`,
            svg: `<svg viewBox="0 0 24 24" fill="#1DA0C3"><path d="M0 18.75l7.437-7.437-7.437-7.438h16.313l7.5 7.438-7.5 7.437z"/></svg>`
        },
        soundcloud: {
            url: (val) => val.startsWith('http') ? val : `https://soundcloud.com/${val}`,
            svg: `<svg viewBox="0 0 24 24" fill="#FF5500"><path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154c-.007.058.038.114.101.114h.467c.063 0 .108-.057.101-.114l-.233-2.154c-.007-.054-.051-.1-.101-.1h-.001zm1.316.366c-.052 0-.095.046-.101.1l-.183 1.788c-.007.058.038.114.101.114h.468c.063 0 .108-.057.101-.114l-.184-1.788c-.006-.054-.05-.1-.1-.1h-.102zm1.275-.734c-.052 0-.095.046-.101.1l-.259 2.522.259 2.477c.007.054.05.1.101.1h.468c.051 0 .094-.046.101-.1l.293-2.477-.293-2.522c-.007-.054-.05-.1-.101-.1h-.468zm1.317.471c-.051 0-.095.046-.101.1l-.222 2.051.222 2.019c.006.054.05.1.101.1h.468c.051 0 .094-.046.101-.1l.252-2.019-.252-2.051c-.007-.054-.05-.1-.101-.1h-.468zm1.317-.682c-.052 0-.095.046-.101.1l-.263 2.733.263 2.612c.006.054.05.1.101.1h.467c.052 0 .095-.046.101-.1l.299-2.612-.299-2.733c-.006-.054-.05-.1-.101-.1h-.467zm1.316-.417c-.051 0-.095.046-.101.1l-.279 3.15.279 2.924c.006.054.05.1.101.1h.468c.051 0 .094-.046.101-.1l.316-2.924-.316-3.15c-.007-.054-.05-.1-.101-.1h-.468zm1.317-.209c-.052 0-.095.046-.101.1l-.295 3.359.295 3.066c.006.054.05.1.101.1h.467c.052 0 .095-.046.101-.1l.334-3.066-.334-3.359c-.006-.054-.05-.1-.101-.1h-.467zm1.316.209c-.051 0-.094.046-.101.1l-.311 3.15.311 3.133c.007.054.05.1.101.1h.468c.051 0 .094-.046.101-.1l.352-3.133-.352-3.15c-.007-.054-.05-.1-.101-.1h-.468zm1.317-.627c-.052 0-.095.046-.101.1l-.328 3.777.328 3.32c.006.054.05.1.101.1h.467c.052 0 .095-.046.101-.1l.37-3.32-.37-3.777c-.006-.054-.05-.1-.101-.1h-.467zm1.316.418c-.051 0-.094.046-.101.1l-.343 3.359.343 3.32c.007.054.05.1.101.1h.468c.051 0 .094-.046.101-.1l.389-3.32-.389-3.359c-.007-.054-.05-.1-.101-.1h-.468zm1.317-1.253c-.052 0-.095.046-.101.1l-.36 4.612.36 3.32c.006.054.05.1.101.1h.467c.052 0 .095-.046.101-.1l.407-3.32-.407-4.612c-.006-.054-.05-.1-.101-.1h-.467zm1.501.627c-.063 0-.115.051-.121.113l-.37 3.985.37 3.32c.006.062.058.113.121.113h.468c.063 0 .115-.051.121-.113l.407-3.32-.407-3.985c-.006-.062-.058-.113-.121-.113h-.468zm1.42-.835c-.074 0-.132.058-.139.132l-.384 4.82.384 3.297c.007.074.065.132.139.132h.468c.074 0 .132-.058.139-.132l.422-3.297-.422-4.82c-.007-.074-.065-.132-.139-.132h-.468zm1.501.208c-.074 0-.132.058-.139.132l-.399 4.612.399 3.297c.007.074.065.132.139.132h.468c.074 0 .132-.058.139-.132l.437-3.297-.437-4.612c-.007-.074-.065-.132-.139-.132h-.468zm1.873-.939c-.187 0-.35.142-.37.328l-.399 5.551.399 3.274c.02.187.183.328.37.328h.093c.187 0 .35-.142.37-.328l.437-3.274-.437-5.551c-.02-.187-.183-.328-.37-.328h-.093zm2.186-.939c-.187 0-.35.142-.37.328l-.437 6.49.437 3.227c.02.187.183.328.37.328h.279c.187 0 .35-.142.37-.328l.468-3.227-.468-6.49c-.02-.187-.183-.328-.37-.328h-.279zm2.001-.418c-.187 0-.35.142-.37.328l-.453 6.908.453 3.18c.02.187.183.328.37.328h.465c.187 0 .35-.142.37-.328l.491-3.18-.491-6.908c-.02-.187-.183-.328-.37-.328h-.465z"/></svg>`
        },
        linktree: {
            url: (val) => val.startsWith('http') ? val : `https://linktr.ee/${val}`,
            svg: `<svg viewBox="0 0 24 24" fill="#43E55E"><path d="m13.73635 5.85251 4.00467-4.11665 2.3248 2.3808-4.20064 4.00466h5.9085v3.30473h-5.9365l4.22865 4.10766-2.3248 2.3338L12.0005 12.099l-5.74052 5.76852-2.3248-2.3248 4.22864-4.10766h-5.9375V8.12132h5.9085L3.93417 4.11666l2.3248-2.3808 4.00468 4.11665V0h3.4727zm-3.4727 10.30614h3.4727V24h-3.4727z"/></svg>`
        }
    };
    
    let html = '';
    for (const [key, value] of Object.entries(links)) {
        if (value && socialIcons[key]) {
            const icon = socialIcons[key];
            const url = icon.url(value);
            html += `<a href="${url}" target="_blank" rel="noopener" class="social-link-btn" title="${key}">${icon.svg}</a>`;
        }
    }
    return html;
}
window.renderSocialLinks = renderSocialLinks;

// ============================================
// REHEARSAL FUNCTIONS
// ============================================

// Current rehearsal state
window.currentRehearsalInviteMode = 'band';
window.currentRehearsalInvitees = [];
window.currentScheduleFilter = 'all';

// Show Create Rehearsal screen
async function showCreateRehearsal() {
    if (!window.currentUser) {
        const user = await window.signInWithGoogle();
        if (!user) return;
    }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    // Explicitly hide screenFeed which may have inline display style
    const screenFeed = document.getElementById('screenFeed');
    if (screenFeed) screenFeed.style.display = 'none';
    document.getElementById('screenCreateRehearsal').classList.add('active');

    // Update URL
    window.history.pushState({}, '', '/new-rehearsal');

    // Hide tab bar
    document.body.classList.add('hide-tab-bar');

    // Reset form state
    window.currentRehearsalInviteMode = 'band';
    window.currentRehearsalInvitees = [];

    // Reset form fields
    document.getElementById('rehearsalName').value = '';
    document.getElementById('rehearsalDate').value = '';
    document.getElementById('rehearsalStartTime').value = '';
    document.getElementById('rehearsalEndTime').value = '';
    document.getElementById('rehearsalLocation').value = '';
    document.getElementById('rehearsalNotes').value = '';

    // Update invite mode buttons
    setInviteMode('band');

    // Load user's bands for the dropdown
    await loadRehearsalBandDropdown();

    // Load user's gigs for linked gig dropdown
    await loadLinkedGigDropdown();
}
window.showCreateRehearsal = showCreateRehearsal;

// Load bands dropdown for rehearsal
async function loadRehearsalBandDropdown() {
    const select = document.getElementById('rehearsalBandSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Select a band...</option>';

    try {
        // Query bands where user is a member
        const memberQuery = query(
            collection(db, "bandMembers"),
            where("memberId", "==", window.currentUser.uid)
        );
        const memberSnap = await getDocs(memberQuery);

        const bandIds = [];
        memberSnap.forEach(doc => {
            bandIds.push(doc.data().bandId);
        });

        // Also get bands where user is leader
        const leaderQuery = query(
            collection(db, "bands"),
            where("leaderId", "==", window.currentUser.uid)
        );
        const leaderSnap = await getDocs(leaderQuery);

        leaderSnap.forEach(doc => {
            if (!bandIds.includes(doc.id)) {
                bandIds.push(doc.id);
            }
        });

        // Fetch band details
        for (const bandId of bandIds) {
            const bandDoc = await getDoc(doc(db, "bands", bandId));
            if (bandDoc.exists()) {
                const band = bandDoc.data();
                select.innerHTML += `<option value="${bandId}">${band.name}</option>`;
            }
        }
    } catch (error) {
        console.error("Error loading bands:", error);
    }
}

// Load linked gig dropdown
async function loadLinkedGigDropdown() {
    const select = document.getElementById('rehearsalLinkedGig');
    if (!select) return;

    select.innerHTML = '<option value="">None</option>';

    try {
        // Query upcoming gigs where user is creator
        const gigsQuery = query(
            collection(db, "gigs"),
            where("creatorId", "==", window.currentUser.uid)
        );
        const gigsSnap = await getDocs(gigsQuery);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const upcomingGigs = [];
        gigsSnap.forEach(doc => {
            const gig = { id: doc.id, ...doc.data() };
            if (new Date(gig.showDate + 'T00:00:00') >= today) {
                upcomingGigs.push(gig);
            }
        });

        // Sort by date
        upcomingGigs.sort((a, b) => new Date(a.showDate) - new Date(b.showDate));

        upcomingGigs.forEach(gig => {
            const date = new Date(gig.showDate + 'T00:00:00');
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            select.innerHTML += `<option value="${gig.id}">${gig.bandName || gig.venue} - ${dateStr}</option>`;
        });
    } catch (error) {
        console.error("Error loading gigs:", error);
    }
}

// Set invite mode (band or individual)
function setInviteMode(mode) {
    window.currentRehearsalInviteMode = mode;

    // Update buttons
    document.getElementById('inviteBandBtn').classList.toggle('active', mode === 'band');
    document.getElementById('inviteIndividualBtn').classList.toggle('active', mode === 'individual');

    // Show/hide sections
    document.getElementById('inviteBandMode').style.display = mode === 'band' ? 'block' : 'none';
    document.getElementById('inviteIndividualMode').style.display = mode === 'individual' ? 'block' : 'none';
}
window.setInviteMode = setInviteMode;

// Handle band selection - load band members
async function onRehearsalBandSelected() {
    const bandId = document.getElementById('rehearsalBandSelect').value;

    if (!bandId) {
        // Hide calendar section when no band selected
        document.getElementById('rehearsalSuggestTimesSection').style.display = 'none';
        document.getElementById('linkedGigSection').style.display = 'none';
        window.selectedBandForRehearsal = null;
        return;
    }

    // Store selected band for rehearsal
    window.selectedBandForRehearsal = bandId;

    // Clear individual invitees when band is selected
    window.currentRehearsalInvitees = [];
    renderInviteesList();

    // Show linked gig section
    document.getElementById('linkedGigSection').style.display = 'block';

    // Check band calendar status
    await checkBandCalendarStatusForRehearsal(bandId);
}
window.onRehearsalBandSelected = onRehearsalBandSelected;

// Check band members' calendar connection status for rehearsal
async function checkBandCalendarStatusForRehearsal(bandId) {
    const suggestSection = document.getElementById('rehearsalSuggestTimesSection');
    const helper = document.getElementById('rehearsalSuggestTimesHelper');

    try {
        // Get band members
        const membersQuery = query(
            collection(db, "bandMembers"),
            where("bandId", "==", bandId),
            where("status", "==", "accepted")
        );
        const membersSnap = await getDocs(membersQuery);

        let connectedCount = 0;
        let totalMembers = membersSnap.size;

        for (const memberDoc of membersSnap.docs) {
            const member = memberDoc.data();
            if (member.userId) {
                const profileDoc = await getDoc(doc(db, "users", member.userId));
                if (profileDoc.exists() && profileDoc.data().calendarConnected) {
                    connectedCount++;
                }
            }
        }

        // Check if leader has calendar connected
        const bandDoc = await getDoc(doc(db, "bands", bandId));
        if (bandDoc.exists()) {
            const band = bandDoc.data();
            if (band.leaderId) {
                const leaderProfile = await getDoc(doc(db, "users", band.leaderId));
                if (leaderProfile.exists() && leaderProfile.data().calendarConnected) {
                    connectedCount++;
                }
                totalMembers++;
            }
        }

        // Store for modal use
        window.rehearsalCalendarConnectedCount = connectedCount;
        window.rehearsalCalendarTotalMembers = totalMembers;

        suggestSection.style.display = 'block';

        if (connectedCount === 0) {
            helper.innerHTML = 'No members have connected calendars yet. <a href="#" onclick="showEditProfile(); return false;" style="color: #667eea;">Connect yours</a>';
        } else {
            helper.textContent = `${connectedCount} of ${totalMembers} members have calendars connected`;
        }

    } catch (error) {
        console.error("Error checking calendar status:", error);
        suggestSection.style.display = 'none';
    }
}
window.checkBandCalendarStatusForRehearsal = checkBandCalendarStatusForRehearsal;

// Add individual invitee by email
function addRehearsalInvitee() {
    const input = document.getElementById('rehearsalInviteEmail');
    const email = input.value.trim();

    if (!email) return;

    // Basic email validation
    if (!email.includes('@')) {
        alert('Please enter a valid email address');
        return;
    }

    // Check for duplicates
    if (window.currentRehearsalInvitees.includes(email)) {
        alert('This email is already added');
        return;
    }

    window.currentRehearsalInvitees.push(email);
    input.value = '';
    renderInviteesList();
}
window.addRehearsalInvitee = addRehearsalInvitee;

// Remove invitee
function removeRehearsalInvitee(index) {
    window.currentRehearsalInvitees.splice(index, 1);
    renderInviteesList();
}
window.removeRehearsalInvitee = removeRehearsalInvitee;

// Render invitees list
function renderInviteesList() {
    const container = document.getElementById('rehearsalInviteesList');
    if (!container) return;

    if (window.currentRehearsalInvitees.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = window.currentRehearsalInvitees.map((email, index) => `
        <div class="invitee-chip">
            <span>${email}</span>
            <button class="invitee-remove" onclick="removeRehearsalInvitee(${index})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
    `).join('');
}

// Create rehearsal
async function createRehearsal() {
    const name = document.getElementById('rehearsalName').value.trim();
    const date = document.getElementById('rehearsalDate').value;
    const startTime = document.getElementById('rehearsalStartTime').value;
    const endTime = document.getElementById('rehearsalEndTime').value;
    const location = document.getElementById('rehearsalLocation').value.trim();
    const notes = document.getElementById('rehearsalNotes').value.trim();
    const linkedGigId = document.getElementById('rehearsalLinkedGig').value;

    // Validation
    if (!name) {
        alert('Please enter a rehearsal name');
        return;
    }
    if (!date) {
        alert('Please select a date');
        return;
    }
    if (!startTime) {
        alert('Please select a start time');
        return;
    }

    // Get band info if inviting a band
    let bandId = null;
    let bandName = null;
    let invitedMembers = [];

    if (window.currentRehearsalInviteMode === 'band') {
        bandId = document.getElementById('rehearsalBandSelect').value;
        if (bandId) {
            const bandDoc = await getDoc(doc(db, "bands", bandId));
            if (bandDoc.exists()) {
                bandName = bandDoc.data().name;
            }

            // Get band members
            const membersQuery = query(
                collection(db, "bandMembers"),
                where("bandId", "==", bandId)
            );
            const membersSnap = await getDocs(membersQuery);
            membersSnap.forEach(doc => {
                invitedMembers.push({
                    odId: doc.data().memberId,
                    email: doc.data().email,
                    status: 'pending'
                });
            });
        }
    } else {
        // Individual invites
        invitedMembers = window.currentRehearsalInvitees.map(email => ({
            odId: null,
            email: email,
            status: 'pending'
        }));
    }

    // Create rehearsal document
    const rehearsalData = {
        name,
        date,
        startTime,
        endTime: endTime || null,
        location: location || null,
        notes: notes || null,
        bandId: bandId || null,
        bandName: bandName || null,
        linkedGigId: linkedGigId || null,
        creatorId: window.currentUser.uid,
        creatorEmail: window.currentUser.email,
        invitedMembers,
        playlist: [],
        files: [],
        createdAt: serverTimestamp()
    };

    try {
        // Add to Firestore
        const docRef = await addDoc(collection(db, "rehearsals"), rehearsalData);

        // Send email notifications
        await sendRehearsalInviteEmails(docRef.id, rehearsalData);

        alert('Rehearsal created!');
        showMySchedule();
    } catch (error) {
        console.error("Error creating rehearsal:", error);
        alert('Error creating rehearsal: ' + error.message);
    }
}
window.createRehearsal = createRehearsal;

// Send email notifications for rehearsal
async function sendRehearsalInviteEmails(rehearsalId, rehearsalData) {
    const rehearsalUrl = `https://tempocal.app/r/${rehearsalId}`;
    const dateStr = new Date(rehearsalData.date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    });
    const timeStr = new Date('2000-01-01T' + rehearsalData.startTime).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
    });

    for (const member of rehearsalData.invitedMembers) {
        if (!member.email) continue;

        try {
            await addDoc(collection(db, "mail"), {
                to: member.email,
                message: {
                    subject: `Rehearsal Invite: ${rehearsalData.name}`,
                    html: `
                        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                            <h2 style="color: #333;">You're invited to a rehearsal!</h2>
                            <div style="background: #f5f5f5; border-radius: 12px; padding: 20px; margin: 20px 0;">
                                <h3 style="margin: 0 0 10px 0; color: #333;">${rehearsalData.name}</h3>
                                ${rehearsalData.bandName ? `<p style="margin: 0 0 5px 0; color: #666;">Band: ${rehearsalData.bandName}</p>` : ''}
                                <p style="margin: 0 0 5px 0; color: #666;">${dateStr} at ${timeStr}</p>
                                ${rehearsalData.location ? `<p style="margin: 0; color: #666;">Location: ${rehearsalData.location}</p>` : ''}
                            </div>
                            <a href="${rehearsalUrl}" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 500;">View Rehearsal & RSVP</a>
                            <p style="color: #888; font-size: 14px; margin-top: 20px;">Sent via Tempo</p>
                        </div>
                    `
                }
            });
        } catch (error) {
            console.error("Error sending email to", member.email, error);
        }
    }
}

// Show My Schedule screen
async function showMySchedule() {
    if (!window.currentUser) {
        const user = await window.signInWithGoogle();
        if (!user) return;
    }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screenMySchedule').classList.add('active');

    // Update URL
    window.history.pushState({}, '', '/schedule');

    // Update tab bar
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tabSchedule').classList.add('active');
    document.body.classList.remove('hide-tab-bar');
    if (window.showTabBar) window.showTabBar();

    await loadMySchedule();
}
window.showMySchedule = showMySchedule;

// Filter schedule
function filterSchedule(filter) {
    window.currentScheduleFilter = filter;

    // Update filter buttons
    document.querySelectorAll('.schedule-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    loadMySchedule();
}
window.filterSchedule = filterSchedule;

// Load schedule items (gigs + rehearsals)
async function loadMySchedule() {
    const container = document.getElementById('myScheduleList');
    if (!container) return;

    container.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';

    try {
        const userId = window.currentUser.uid;
        const userEmail = window.currentUser.email;
        const filter = window.currentScheduleFilter || 'all';

        let items = [];

        // Load gigs if filter is 'all' or 'gigs'
        if (filter === 'all' || filter === 'gigs') {
            // Gigs where user is creator
            const createdGigsQuery = query(
                collection(db, "gigs"),
                where("creatorId", "==", userId)
            );
            const createdGigsSnap = await getDocs(createdGigsQuery);

            createdGigsSnap.forEach(doc => {
                items.push({ id: doc.id, ...doc.data(), type: 'gig', role: 'leader' });
            });

            // Gigs where user responded
            const respondedGigsQuery = query(
                collection(db, "gigs"),
                where("responderIds", "array-contains", userId)
            );
            const respondedGigsSnap = await getDocs(respondedGigsQuery);

            respondedGigsSnap.forEach(doc => {
                if (!items.find(i => i.id === doc.id)) {
                    items.push({ id: doc.id, ...doc.data(), type: 'gig', role: 'musician' });
                }
            });
        }

        // Load rehearsals if filter is 'all' or 'rehearsals'
        if (filter === 'all' || filter === 'rehearsals') {
            // Rehearsals where user is creator
            const createdRehearsalsQuery = query(
                collection(db, "rehearsals"),
                where("creatorId", "==", userId)
            );
            const createdRehearsalsSnap = await getDocs(createdRehearsalsQuery);

            createdRehearsalsSnap.forEach(doc => {
                items.push({ id: doc.id, ...doc.data(), type: 'rehearsal', role: 'leader' });
            });

            // Rehearsals where user is invited (by email)
            // Note: Firestore doesn't support array-contains on nested fields,
            // so we'll query by bandId for band members

            // Get user's bands
            const memberQuery = query(
                collection(db, "bandMembers"),
                where("memberId", "==", userId)
            );
            const memberSnap = await getDocs(memberQuery);

            const bandIds = [];
            memberSnap.forEach(doc => {
                bandIds.push(doc.data().bandId);
            });

            // Query rehearsals for each band
            for (const bandId of bandIds) {
                const bandRehearsalsQuery = query(
                    collection(db, "rehearsals"),
                    where("bandId", "==", bandId)
                );
                const bandRehearsalsSnap = await getDocs(bandRehearsalsQuery);

                bandRehearsalsSnap.forEach(doc => {
                    if (!items.find(i => i.id === doc.id)) {
                        items.push({ id: doc.id, ...doc.data(), type: 'rehearsal', role: 'member' });
                    }
                });
            }
        }

        // Separate upcoming and past
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const upcomingItems = items.filter(item => {
            const dateField = item.type === 'gig' ? item.showDate : item.date;
            return new Date(dateField + 'T00:00:00') >= today;
        });

        const pastItems = items.filter(item => {
            const dateField = item.type === 'gig' ? item.showDate : item.date;
            return new Date(dateField + 'T00:00:00') < today;
        });

        // Sort
        upcomingItems.sort((a, b) => {
            const dateA = a.type === 'gig' ? a.showDate : a.date;
            const dateB = b.type === 'gig' ? b.showDate : b.date;
            return new Date(dateA) - new Date(dateB);
        });

        pastItems.sort((a, b) => {
            const dateA = a.type === 'gig' ? a.showDate : a.date;
            const dateB = b.type === 'gig' ? b.showDate : b.date;
            return new Date(dateB) - new Date(dateA);
        });

        if (items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
                    <p>No ${filter === 'all' ? 'events' : filter} yet!</p>
                    <p style="font-size: 13px; margin-top: 8px;">Create your first ${filter === 'rehearsals' ? 'rehearsal' : 'gig'} to get started.</p>
                </div>
            `;
            return;
        }

        let html = '';

        if (upcomingItems.length > 0) {
            html += '<h3 class="section-title">Upcoming</h3>';
            upcomingItems.forEach(item => {
                html += renderScheduleItem(item, false);
            });
        }

        if (pastItems.length > 0) {
            html += '<h3 class="section-title" style="margin-top: 24px;">Past</h3>';
            pastItems.forEach(item => {
                html += renderScheduleItem(item, true);
            });
        }

        container.innerHTML = html;
    } catch (error) {
        console.error("Error loading schedule:", error);
        container.innerHTML = '<div class="empty-state"><p>Error loading schedule</p></div>';
    }
}

// Render a schedule item card
function renderScheduleItem(item, isPast) {
    const isGig = item.type === 'gig';
    const dateField = isGig ? item.showDate : item.date;
    const dateObj = new Date(dateField + 'T00:00:00');
    const dateStr = dateObj.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });

    const typeIcon = isGig
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>';

    const title = isGig ? (item.bandName || item.venue || 'Untitled Gig') : item.name;
    const subtitle = isGig ? item.venue : (item.bandName || item.location || '');

    let timeStr = '';
    if (!isGig && item.startTime) {
        timeStr = new Date('2000-01-01T' + item.startTime).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    const onclick = isGig ? `openGig('${item.id}', '${item.role}')` : `showRehearsalDetail('${item.id}')`;

    return `
        <div class="schedule-item ${isPast ? 'past' : ''}" onclick="${onclick}">
            <div class="schedule-item-header">
                <h4 class="schedule-item-title">${title}</h4>
                <span class="type-badge ${item.type}">${typeIcon} ${isGig ? 'Gig' : 'Rehearsal'}</span>
            </div>
            <div class="schedule-item-meta">
                <span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    ${dateStr}${timeStr ? ' at ' + timeStr : ''}
                </span>
                ${subtitle ? `
                    <span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        ${subtitle}
                    </span>
                ` : ''}
            </div>
        </div>
    `;
}

// Show rehearsal detail screen
async function showRehearsalDetail(rehearsalId) {
    // Ensure all screens are hidden, especially screenFeed
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screenFeed = document.getElementById('screenFeed');
    if (screenFeed) screenFeed.style.display = 'none';

    // Show rehearsal detail screen
    const detailScreen = document.getElementById('screenRehearsalDetail');
    detailScreen.classList.add('active');
    detailScreen.style.display = 'block';

    // Show loading state
    document.getElementById('rehearsalDetailName').textContent = 'Loading...';
    document.getElementById('rehearsalDetailDate').textContent = '';
    document.getElementById('rehearsalDetailTime').textContent = '';

    // Update URL
    window.history.pushState({}, '', '/r/' + rehearsalId);

    // Hide tab bar
    document.body.classList.add('hide-tab-bar');

    // Store current rehearsal ID
    window.currentRehearsalId = rehearsalId;

    try {
        const rehearsalDoc = await getDoc(doc(db, "rehearsals", rehearsalId));
        if (!rehearsalDoc.exists()) {
            alert('Rehearsal not found');
            showMySchedule();
            return;
        }

        const rehearsal = { id: rehearsalDoc.id, ...rehearsalDoc.data() };
        window.currentRehearsalData = rehearsal;

        // Update UI elements
        document.getElementById('rehearsalDetailName').textContent = rehearsal.name;
        document.getElementById('rehearsalDetailBand').textContent = rehearsal.bandName || '';
        document.getElementById('rehearsalDetailBand').style.display = rehearsal.bandName ? 'block' : 'none';

        // Format date and time
        const dateObj = new Date(rehearsal.date + 'T00:00:00');
        const dateStr = dateObj.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        let timeStr = '';
        if (rehearsal.startTime) {
            const startTimeStr = new Date('2000-01-01T' + rehearsal.startTime).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit'
            });
            timeStr = startTimeStr;
            if (rehearsal.endTime) {
                const endTimeStr = new Date('2000-01-01T' + rehearsal.endTime).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit'
                });
                timeStr += ' - ' + endTimeStr;
            }
        }

        document.getElementById('rehearsalDetailDate').textContent = dateStr;
        document.getElementById('rehearsalDetailTime').textContent = timeStr;

        // Location
        const locationEl = document.getElementById('rehearsalDetailLocation');
        if (rehearsal.location) {
            locationEl.innerHTML = `
                <div class="rehearsal-location-card">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span>${rehearsal.location}</span>
                </div>
            `;
            locationEl.style.display = 'block';
        } else {
            locationEl.style.display = 'none';
        }

        // Notes
        const notesEl = document.getElementById('rehearsalDetailNotes');
        if (rehearsal.notes) {
            notesEl.innerHTML = `<div class="rehearsal-notes">${rehearsal.notes}</div>`;
            notesEl.style.display = 'block';
        } else {
            notesEl.style.display = 'none';
        }

        // Linked gig
        const linkedGigEl = document.getElementById('rehearsalDetailLinkedGig');
        if (rehearsal.linkedGigId) {
            const gigDoc = await getDoc(doc(db, "gigs", rehearsal.linkedGigId));
            if (gigDoc.exists()) {
                const gig = gigDoc.data();
                const gigDate = new Date(gig.showDate + 'T00:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                });
                linkedGigEl.innerHTML = `
                    <h4>Linked Gig</h4>
                    <div class="linked-gig-card" onclick="viewLinkedGig('${rehearsal.linkedGigId}')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                        <div class="linked-gig-info">
                            <h5>${gig.bandName || gig.venue}</h5>
                            <span>${gigDate} · ${gig.venue || ''}</span>
                        </div>
                    </div>
                `;
                linkedGigEl.style.display = 'block';
            } else {
                linkedGigEl.style.display = 'none';
            }
        } else {
            linkedGigEl.style.display = 'none';
        }

        // RSVP buttons - check current user's status
        updateRsvpButtons(rehearsal);

        // RSVP responses
        renderRsvpResponses(rehearsal);

        // Show Send Invites section for organizer
        const smsSection = document.getElementById('rehearsalSmsSection');
        if (smsSection && window.currentUser && rehearsal.creatorId === window.currentUser.uid) {
            smsSection.style.display = 'block';
        } else if (smsSection) {
            smsSection.style.display = 'none';
        }

    } catch (error) {
        console.error("Error loading rehearsal:", error);
        // Show sign-in prompt for unauthenticated users
        if (!window.currentUser) {
            // Store rehearsal ID in sessionStorage so it survives sign-in redirect
            sessionStorage.setItem('pendingRehearsalDetail', rehearsalId);
            window.pendingRehearsalDetail = rehearsalId;

            document.getElementById('rehearsalDetailName').textContent = 'Sign in to view this rehearsal';
            document.getElementById('rehearsalDetailDate').textContent = 'You need to sign in to see rehearsal details';
            document.getElementById('rehearsalDetailTime').textContent = '';
            // Show RSVP section with sign-in button
            const rsvpSection = document.getElementById('rehearsalRsvpSection');
            if (rsvpSection) {
                rsvpSection.style.display = 'block';
                rsvpSection.innerHTML = `
                    <h2>Sign in to RSVP</h2>
                    <button class="btn btn-primary" onclick="window.signInForRsvp()" style="width: 100%;">
                        Sign in with Google
                    </button>
                `;
            }
        } else {
            alert('Error loading rehearsal');
            showMySchedule();
        }
    }
}
window.showRehearsalDetail = showRehearsalDetail;

// Sign in for RSVP - sets flag to reload on auth state change
window.pendingRsvpReload = false;
window.signInForRsvp = async function() {
    window.pendingRsvpReload = true;
    await window.signInWithGoogle();
    // The reload will happen in onAuthStateChanged
};

// Update RSVP buttons based on current user's status
function updateRsvpButtons(rehearsal) {
    const userId = window.currentUser?.uid;
    const userEmail = window.currentUser?.email;
    const rsvpSection = document.getElementById('rehearsalRsvpSection');

    // If user is not logged in, show sign-in prompt
    if (!window.currentUser) {
        // Store rehearsal ID so auth handler will reload after sign-in
        if (window.currentRehearsalId) {
            sessionStorage.setItem('pendingRehearsalDetail', window.currentRehearsalId);
            window.pendingRehearsalDetail = window.currentRehearsalId;
        }
        if (rsvpSection) {
            rsvpSection.style.display = 'block';
            rsvpSection.innerHTML = `
                <h2>Sign in to RSVP</h2>
                <p style="color: #888; margin-bottom: 16px;">Sign in to let the organizer know if you can make it.</p>
                <button class="btn btn-primary rsvp-sign-in-btn" style="width: 100%;">
                    <svg width="18" height="18" viewBox="0 0 24 24" style="vertical-align: -3px; margin-right: 8px;"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                    Sign in with Google
                </button>
            `;
            // Add click handler via addEventListener
            const signInBtn = rsvpSection.querySelector('.rsvp-sign-in-btn');
            if (signInBtn) {
                signInBtn.addEventListener('click', async () => {
                    await window.signInForRsvp();
                });
            }
        }
        return;
    }

    // Check if user is the creator (creators don't RSVP to their own rehearsal)
    const isCreator = rehearsal.creatorId === userId;

    // Check if user is invited
    let isInvited = false;
    let currentStatus = 'pending';
    if (rehearsal.invitedMembers) {
        const member = rehearsal.invitedMembers.find(m =>
            m.odId === userId || m.email === userEmail
        );
        if (member) {
            isInvited = true;
            currentStatus = member.status || 'pending';
        }
    }

    // Show RSVP section for invited non-creators, or prompt to RSVP for non-invited users
    if (rsvpSection) {
        if (isCreator) {
            rsvpSection.style.display = 'none';
        } else {
            // Restore original RSVP buttons HTML if needed
            if (!rsvpSection.querySelector('.rsvp-buttons')) {
                rsvpSection.innerHTML = `
                    <h2>Your Response</h2>
                    <div class="rsvp-buttons">
                        <button class="rsvp-btn going" data-response="yes">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>
                            Going
                        </button>
                        <button class="rsvp-btn maybe" data-response="maybe">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/></svg>
                            Maybe
                        </button>
                        <button class="rsvp-btn cant" data-response="no">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            Can't make it
                        </button>
                    </div>
                `;
                // Add click handlers
                rsvpSection.querySelectorAll('.rsvp-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const response = btn.dataset.response;
                        await rsvpRehearsal(response);
                    });
                });
            }
            rsvpSection.style.display = 'block';
        }
    }

    // Update button states
    document.querySelectorAll('.rsvp-btn').forEach(btn => {
        const btnResponse = btn.dataset.response;
        // Map response values to status values
        const statusMap = { 'yes': 'going', 'maybe': 'maybe', 'no': 'cant' };
        btn.classList.toggle('active', statusMap[btnResponse] === currentStatus);
    });
}

// Render RSVP responses
function renderRsvpResponses(rehearsal) {
    const container = document.getElementById('rehearsalResponsesList');
    const section = document.getElementById('rehearsalResponsesSection');
    if (!container) return;

    if (!rehearsal.invitedMembers || rehearsal.invitedMembers.length === 0) {
        if (section) section.style.display = 'none';
        return;
    }

    const going = rehearsal.invitedMembers.filter(m => m.status === 'going');
    const maybe = rehearsal.invitedMembers.filter(m => m.status === 'maybe');
    const cant = rehearsal.invitedMembers.filter(m => m.status === 'cant');
    const pending = rehearsal.invitedMembers.filter(m => !m.status || m.status === 'pending');

    let html = '<h4>Responses</h4>';

    if (going.length > 0) {
        html += `
            <div class="response-group going">
                <div class="response-group-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    Going (${going.length})
                </div>
                <div class="response-avatars">
                    ${going.map(m => `<div class="response-avatar" title="${m.email}">${(m.email || '?')[0].toUpperCase()}</div>`).join('')}
                </div>
            </div>
        `;
    }

    if (maybe.length > 0) {
        html += `
            <div class="response-group maybe">
                <div class="response-group-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    Maybe (${maybe.length})
                </div>
                <div class="response-avatars">
                    ${maybe.map(m => `<div class="response-avatar" title="${m.email}">${(m.email || '?')[0].toUpperCase()}</div>`).join('')}
                </div>
            </div>
        `;
    }

    if (cant.length > 0) {
        html += `
            <div class="response-group cant">
                <div class="response-group-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    Can't Make It (${cant.length})
                </div>
                <div class="response-avatars">
                    ${cant.map(m => `<div class="response-avatar" title="${m.email}">${(m.email || '?')[0].toUpperCase()}</div>`).join('')}
                </div>
            </div>
        `;
    }

    if (pending.length > 0) {
        html += `
            <div class="response-group pending">
                <div class="response-group-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
                    Pending (${pending.length})
                </div>
                <div class="response-avatars">
                    ${pending.map(m => `<div class="response-avatar" title="${m.email}">${(m.email || '?')[0].toUpperCase()}</div>`).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
    if (section) section.style.display = 'block';
}

// RSVP to a rehearsal
async function rsvpRehearsal(response) {
    if (!window.currentUser) {
        const user = await window.signInWithGoogle();
        if (!user) return;
    }

    const rehearsalId = window.currentRehearsalId;
    if (!rehearsalId) {
        alert('No rehearsal ID found');
        return;
    }

    // Map button responses to status values
    const statusMap = { 'yes': 'going', 'maybe': 'maybe', 'no': 'cant' };
    const status = statusMap[response] || response;

    try {
        const rehearsalRef = doc(db, "rehearsals", rehearsalId);
        const rehearsalDoc = await getDoc(rehearsalRef);

        if (!rehearsalDoc.exists()) {
            alert('Rehearsal not found');
            return;
        }

        const rehearsal = rehearsalDoc.data();
        const userId = window.currentUser.uid;
        const userEmail = window.currentUser.email;

        // Update invited members array
        let invitedMembers = rehearsal.invitedMembers || [];
        let memberIndex = invitedMembers.findIndex(m =>
            m.odId === userId || m.email === userEmail
        );

        if (memberIndex >= 0) {
            invitedMembers[memberIndex].status = status;
        } else {
            // User not in invited list, add them
            invitedMembers.push({
                odId: userId,
                email: userEmail,
                status: status
            });
        }

        await updateDoc(rehearsalRef, { invitedMembers });

        // Update UI immediately
        if (window.currentRehearsalData) {
            window.currentRehearsalData.invitedMembers = invitedMembers;
        }

        // Update button states directly for immediate visual feedback
        document.querySelectorAll('.rsvp-btn').forEach(btn => {
            const btnResponse = btn.dataset.response;
            const statusMap = { 'yes': 'going', 'maybe': 'maybe', 'no': 'cant' };
            const btnStatus = statusMap[btnResponse];
            const isActive = btnStatus === status;
            // Remove all status classes first
            btn.classList.remove('going', 'maybe', 'cant', 'active');
            // Add the status class and active if this is the selected button
            btn.classList.add(btnStatus);
            if (isActive) {
                btn.classList.add('active');
            }
        });

        // Update responses display
        if (window.currentRehearsalData) {
            renderRsvpResponses(window.currentRehearsalData);
        }

    } catch (error) {
        console.error("Error updating RSVP:", error);
        alert('Error updating RSVP: ' + error.message);
    }
}
window.rsvpRehearsal = rsvpRehearsal;

// View linked gig
function viewLinkedGig(gigId) {
    if (window.openGig) {
        window.openGig(gigId, 'viewer');
    }
}
window.viewLinkedGig = viewLinkedGig;

// Backward compatibility - redirect showMyGigs to showMySchedule
window.showMyGigs = showMySchedule;

// ============================================
// ME TAB (own profile entry)
// ============================================

function showOwnProfile() {
    if (window.currentUser) {
        viewMusicianProfile(window.currentUser.uid);
    } else {
        alert('Please sign in to view your profile');
    }
}
window.showOwnProfile = showOwnProfile;

// ============================================
// UNIFIED EVENT CREATION (Partiful-style)
// ============================================

window.currentEventType = 'show';
window.currentEventCover = null;
window.currentEventFiles = [];

// Show unified create event modal
async function showCreateEvent(initialType = 'show') {
    if (!window.currentUser) {
        const user = await window.signInWithGoogle();
        if (!user) return;
    }

    // Show modal
    document.getElementById('createEventModal').classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent background scroll

    // Reset form state
    window.currentEventType = initialType;
    window.currentEventCover = null;
    window.currentEventFiles = [];

    // Reset form fields
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventDate').value = '';
    document.getElementById('eventTime').value = '';
    document.getElementById('eventLocation').value = '';
    document.getElementById('eventNotes').value = '';
    document.getElementById('eventDoors').value = '';
    document.getElementById('eventSetTime').value = '';
    document.getElementById('eventLoadIn').value = '';
    document.getElementById('eventSetLength').value = '';
    document.getElementById('eventTicketLink').value = '';
    document.getElementById('eventEndTime').value = '';
    document.getElementById('eventPlaylistUrl').value = '';
    document.getElementById('eventUploadedFiles').innerHTML = '';

    // Reset cover image
    document.getElementById('eventCoverPreview').style.display = 'none';
    document.getElementById('eventCoverUpload').style.display = 'flex';

    // Set initial event type
    setEventType(initialType);

    // Load user's bands
    await loadEventBandDropdown();
}
window.showCreateEvent = showCreateEvent;

// Set event type (show or rehearsal)
function setEventType(type) {
    window.currentEventType = type;

    // Update toggle buttons
    document.getElementById('eventTypeShow').classList.toggle('active', type === 'show');
    document.getElementById('eventTypeRehearsal').classList.toggle('active', type === 'rehearsal');

    // Show/hide type-specific sections
    document.getElementById('showDetailsSection').style.display = type === 'show' ? 'block' : 'none';
    document.getElementById('rehearsalOptionsSection').style.display = type === 'rehearsal' ? 'block' : 'none';

    // Update create button text
    document.getElementById('createEventBtnText').textContent = type === 'show' ? 'Create Show' : 'Create Rehearsal';
}
window.setEventType = setEventType;

// Load bands dropdown
async function loadEventBandDropdown() {
    const select = document.getElementById('eventBandSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Select a band (optional)</option>';

    try {
        // Query bands where user is a member
        const memberQuery = query(
            collection(db, "bandMembers"),
            where("memberId", "==", window.currentUser.uid)
        );
        const memberSnap = await getDocs(memberQuery);

        const bandIds = [];
        memberSnap.forEach(doc => {
            bandIds.push(doc.data().bandId);
        });

        // Also get bands where user is leader
        const leaderQuery = query(
            collection(db, "bands"),
            where("leaderId", "==", window.currentUser.uid)
        );
        const leaderSnap = await getDocs(leaderQuery);

        leaderSnap.forEach(doc => {
            if (!bandIds.includes(doc.id)) {
                bandIds.push(doc.id);
            }
        });

        // Fetch band details
        for (const bandId of bandIds) {
            const bandDoc = await getDoc(doc(db, "bands", bandId));
            if (bandDoc.exists()) {
                const band = bandDoc.data();
                select.innerHTML += `<option value="${bandId}">${band.name}</option>`;
            }
        }
    } catch (error) {
        console.error("Error loading bands:", error);
    }
}

// Handle band selection
function onEventBandSelected() {
    const bandId = document.getElementById('eventBandSelect').value;
    const checkCalendarsSection = document.getElementById('eventCheckCalendarsSection');
    if (checkCalendarsSection) {
        checkCalendarsSection.style.display = bandId ? 'block' : 'none';
    }
}
window.onEventBandSelected = onEventBandSelected;

// Cover image handling
function handleEventCoverSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('eventCoverImg').src = e.target.result;
        document.getElementById('eventCoverPreview').style.display = 'block';
        document.getElementById('eventCoverUpload').style.display = 'none';
        window.currentEventCover = { file: file, dataUrl: e.target.result };
    };
    reader.readAsDataURL(file);
}
window.handleEventCoverSelect = handleEventCoverSelect;

function removeEventCover() {
    window.currentEventCover = null;
    document.getElementById('eventCoverPreview').style.display = 'none';
    document.getElementById('eventCoverUpload').style.display = 'flex';
    document.getElementById('eventCoverInput').value = '';
}
window.removeEventCover = removeEventCover;

// Default cover images (emoji-based for now)
function setDefaultCover(type) {
    const gradients = {
        'stage': 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f1a 100%)',
        'crowd': 'linear-gradient(135deg, #2d1b3d 0%, #1a1a2e 50%, #0f0f1a 100%)',
        'lights': 'linear-gradient(135deg, #1e3a5f 0%, #1a1a2e 50%, #0f0f1a 100%)',
        'drums': 'linear-gradient(135deg, #3d1b1b 0%, #1a1a2e 50%, #0f0f1a 100%)'
    };

    const coverArea = document.getElementById('eventCoverArea');
    coverArea.style.background = gradients[type] || gradients['stage'];
    coverArea.style.border = 'none';
    document.getElementById('eventCoverUpload').style.display = 'none';

    window.currentEventCover = { type: 'gradient', gradient: type };
}
window.setDefaultCover = setDefaultCover;

// File upload handling
async function handleEventFileSelect(event) {
    const files = event.target.files;
    if (!files.length) return;

    const container = document.getElementById('eventUploadedFiles');

    for (const file of files) {
        const fileId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // Add to UI
        const fileEl = document.createElement('div');
        fileEl.className = 'uploaded-file';
        fileEl.id = `event-file-${fileId}`;
        fileEl.innerHTML = `
            <span class="file-name">${file.name}</span>
            <span class="file-status uploading">Uploading...</span>
        `;
        container.appendChild(fileEl);

        try {
            // Upload to Firebase Storage
            const storageRef = ref(storage, `events/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);

            // Update status
            fileEl.querySelector('.file-status').className = 'file-status uploaded';
            fileEl.querySelector('.file-status').textContent = 'Uploaded';
            fileEl.innerHTML += `<button class="file-remove" onclick="removeEventFile('${fileId}')">×</button>`;

            window.currentEventFiles.push({
                id: fileId,
                name: file.name,
                type: file.type,
                url: url,
                storagePath: storageRef.fullPath
            });
        } catch (error) {
            console.error('Error uploading file:', error);
            fileEl.querySelector('.file-status').className = 'file-status error';
            fileEl.querySelector('.file-status').textContent = 'Failed';
        }
    }

    event.target.value = '';
}
window.handleEventFileSelect = handleEventFileSelect;

function removeEventFile(fileId) {
    window.currentEventFiles = window.currentEventFiles.filter(f => f.id !== fileId);
    const el = document.getElementById(`event-file-${fileId}`);
    if (el) el.remove();
}
window.removeEventFile = removeEventFile;

// Cancel create event
function closeCreateEventModal() {
    document.getElementById('createEventModal').classList.remove('active');
    document.body.style.overflow = ''; // Restore scroll
}
window.closeCreateEventModal = closeCreateEventModal;

function cancelCreateEvent() {
    closeCreateEventModal();
}
window.cancelCreateEvent = cancelCreateEvent;

// Create event (unified for both shows and rehearsals)
async function createEvent() {
    const title = document.getElementById('eventTitle').value.trim();
    const date = document.getElementById('eventDate').value;
    const time = document.getElementById('eventTime').value;
    const location = document.getElementById('eventLocation').value.trim();
    const notes = document.getElementById('eventNotes').value.trim();
    const bandId = document.getElementById('eventBandSelect').value;
    const playlistUrl = document.getElementById('eventPlaylistUrl').value.trim();

    // Validation
    if (!title) {
        alert('Please enter a title');
        return;
    }
    if (!date) {
        alert('Please select a date');
        return;
    }

    const btn = document.getElementById('createEventBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Creating...';

    try {
        // Get band info if selected
        let bandName = null;
        let invitedMembers = [];

        if (bandId) {
            const bandDoc = await getDoc(doc(db, "bands", bandId));
            if (bandDoc.exists()) {
                bandName = bandDoc.data().name;
            }

            // Get band members
            const membersQuery = query(
                collection(db, "bandMembers"),
                where("bandId", "==", bandId)
            );
            const membersSnap = await getDocs(membersQuery);
            membersSnap.forEach(doc => {
                invitedMembers.push({
                    odId: doc.data().memberId,
                    email: doc.data().email,
                    status: 'pending'
                });
            });
        }

        // Upload cover image if present
        let coverImage = null;
        if (window.currentEventCover) {
            if (window.currentEventCover.file) {
                const storageRef = ref(storage, `events/${Date.now()}_cover_${window.currentEventCover.file.name}`);
                await uploadBytes(storageRef, window.currentEventCover.file);
                const url = await getDownloadURL(storageRef);
                coverImage = { url, storagePath: storageRef.fullPath };
            } else if (window.currentEventCover.gradient) {
                coverImage = { type: 'gradient', gradient: window.currentEventCover.gradient };
            }
        }

        if (window.currentEventType === 'show') {
            // Create gig document
            const gigData = {
                bandName: bandName || title,
                venue: location || '',
                showDate: date,
                loadIn: document.getElementById('eventLoadIn').value || '',
                setTime: document.getElementById('eventSetTime').value || time || '',
                setLength: document.getElementById('eventSetLength').value || '',
                doors: document.getElementById('eventDoors').value || '',
                ticketLink: document.getElementById('eventTicketLink').value || '',
                notes: notes || '',
                coverImage: coverImage,
                streamingLink: playlistUrl,
                files: window.currentEventFiles.map(f => ({ name: f.name, type: f.type, url: f.url })),
                suggestedTimes: [],
                createdAt: serverTimestamp(),
                creatorId: window.currentUser.uid,
                creatorEmail: window.currentUser.email,
                creatorName: window.currentUser.displayName,
                bandId: bandId || null,
                responderIds: [],
                expectedResponders: invitedMembers.length,
                invites: []
            };

            const docRef = await addDoc(collection(db, "gigs"), gigData);

            // Notify band members
            if (bandId) {
                await notifyBandMembersOfGig(bandId, docRef.id, gigData);
            }

            alert('Show created!');
        } else {
            // Create rehearsal document
            const rehearsalData = {
                name: title,
                date,
                startTime: time || '',
                endTime: document.getElementById('eventEndTime').value || null,
                location: location || null,
                notes: notes || null,
                bandId: bandId || null,
                bandName: bandName || null,
                linkedGigId: null,
                creatorId: window.currentUser.uid,
                creatorEmail: window.currentUser.email,
                invitedMembers,
                coverImage: coverImage,
                playlist: playlistUrl ? [playlistUrl] : [],
                files: window.currentEventFiles.map(f => ({ name: f.name, type: f.type, url: f.url })),
                createdAt: serverTimestamp(),
                invites: []
            };

            const docRef = await addDoc(collection(db, "rehearsals"), rehearsalData);

            // Send notifications
            await sendRehearsalInviteEmails(docRef.id, rehearsalData);

            alert('Rehearsal created!');
        }

        closeCreateEventModal();

    } catch (error) {
        console.error("Error creating event:", error);
        alert('Error creating event: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span id="createEventBtnText">${window.currentEventType === 'show' ? 'Create Show' : 'Create Rehearsal'}</span>`;
    }
}
window.createEvent = createEvent;

// Update create sheet to use new unified screen
function showCreateEventFromSheet(type) {
    closeCreateSheet();
    showCreateEvent(type);
}
window.showCreateEventFromSheet = showCreateEventFromSheet;

// ============================================
// UNIFIED INVITE SYSTEM (SMS + Email)
// ============================================

window.inviteState = {
    eventType: null,      // 'band', 'gig', 'rehearsal'
    eventId: null,
    eventData: null,
    selectedRecipients: [],  // [{name, email, phone, tempoUserId}]
    defaultSmsMessage: '',
    defaultEmailSubject: '',
    defaultEmailBody: '',
    preSelectedMembers: null  // For band creation flow
};

// Open unified invite modal
async function openUnifiedInviteModal(eventType, eventId = null, eventData = null) {
    if (!window.currentUser) {
        alert('Please sign in to send invites');
        return;
    }

    // Store context
    window.inviteState.eventType = eventType;
    window.inviteState.eventId = eventId;
    window.inviteState.eventData = eventData;
    window.inviteState.selectedRecipients = [];

    const modal = document.getElementById('unifiedInviteModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Set modal title based on event type
    const titles = {
        band: eventData?.name || 'Band',
        gig: eventData?.bandName || eventData?.venue || 'Gig',
        rehearsal: eventData?.name || 'Rehearsal'
    };
    document.getElementById('inviteModalEventName').textContent = titles[eventType] || 'Event';

    // Generate default messages
    generateDefaultInviteMessages(eventType, eventData);

    // For bands, hide "Band" tab, show only Contacts/Manual
    const bandTab = document.querySelector('[data-tab="band"]');
    if (eventType === 'band') {
        bandTab.style.display = 'none';
        switchInviteTab('contacts');
    } else {
        bandTab.style.display = '';
        await loadInviteBandMembers(eventData?.bandId);
        switchInviteTab('band');
    }

    // Load contacts
    await loadInviteContacts();

    // Pre-select members if coming from band creation
    if (window.inviteState.preSelectedMembers && window.inviteState.preSelectedMembers.length > 0) {
        window.inviteState.selectedRecipients = [...window.inviteState.preSelectedMembers];
        window.inviteState.preSelectedMembers = null;
    }

    renderInviteSelectedRecipients();
    updateInviteDeliveryPreview();
}
window.openUnifiedInviteModal = openUnifiedInviteModal;

// Open invite modal for current rehearsal
function openRehearsalInviteModal() {
    const rehearsal = window.currentRehearsalData;
    if (!rehearsal) {
        alert('No rehearsal data available');
        return;
    }
    openUnifiedInviteModal('rehearsal', rehearsal.id, {
        id: rehearsal.id,
        name: rehearsal.name,
        date: rehearsal.date,
        startTime: rehearsal.startTime,
        location: rehearsal.location,
        bandId: rehearsal.bandId,
        bandName: rehearsal.bandName
    });
}
window.openRehearsalInviteModal = openRehearsalInviteModal;

// Open invite modal for current gig
function openGigInviteModal() {
    const gigId = window.currentGigId;
    const gig = window.currentGig;
    if (!gigId || !gig) {
        alert('No gig data available');
        return;
    }
    openUnifiedInviteModal('gig', gigId, {
        id: gigId,
        bandName: gig.bandName,
        venue: gig.venue,
        showDate: gig.showDate,
        setTime: gig.setTime,
        bandId: gig.bandId
    });
}
window.openGigInviteModal = openGigInviteModal;

// Close unified invite modal
function closeUnifiedInviteModal() {
    document.getElementById('unifiedInviteModal').classList.remove('active');
    document.body.style.overflow = '';
    window.inviteState.selectedRecipients = [];
    window.inviteState.preSelectedMembers = null;

    // If closing after band creation, show the band detail
    if (window.inviteState.eventType === 'band' && window.inviteState.eventId) {
        showBandDetail(window.inviteState.eventId);
    }
}
window.closeUnifiedInviteModal = closeUnifiedInviteModal;

// Generate default invite messages based on event type
function generateDefaultInviteMessages(eventType, eventData) {
    let smsMsg = '';
    let emailSubject = '';
    let emailBody = '';
    const baseUrl = window.location.origin;

    if (eventType === 'band') {
        const bandName = eventData?.name || 'the band';
        smsMsg = `You're invited to join ${bandName} on Tempo! Join here: ${baseUrl}?joinBand=${eventData?.id || ''}`;
        emailSubject = `You're invited to join ${bandName} on Tempo`;
        emailBody = `Hey!\n\nYou've been invited to join ${bandName} on Tempo - the easiest way to coordinate gigs and rehearsals.\n\nClick the link to join the band and start collaborating.`;
    } else if (eventType === 'gig') {
        const dateStr = eventData?.showDate ? formatDateForDisplay(eventData.showDate) : 'TBD';
        const bandName = eventData?.bandName || 'a gig';
        const venue = eventData?.venue || 'TBD';
        smsMsg = `${bandName} at ${venue} on ${dateStr}. Reply YES, NO, or MAYBE to RSVP.`;
        emailSubject = `New Gig: ${bandName} at ${venue}`;
        emailBody = `A new gig has been scheduled!\n\nVenue: ${venue}\nDate: ${dateStr}${eventData?.setTime ? '\nSet Time: ' + eventData.setTime : ''}\n\nClick the link to view details and confirm your availability.`;
    } else if (eventType === 'rehearsal') {
        const dateStr = eventData?.date ? formatDateForDisplay(eventData.date) : 'TBD';
        const timeStr = eventData?.startTime ? formatTimeForDisplay(eventData.startTime) : '';
        const name = eventData?.name || 'Band rehearsal';
        smsMsg = `Rehearsal: ${name} on ${dateStr}${timeStr ? ' at ' + timeStr : ''}${eventData?.location ? ' @ ' + eventData.location : ''}. Reply YES, NO, or MAYBE.`;
        emailSubject = `Rehearsal Invite: ${name}`;
        emailBody = `You're invited to a rehearsal!\n\n${name}${eventData?.bandName ? '\nBand: ' + eventData.bandName : ''}\nDate: ${dateStr}${timeStr ? ' at ' + timeStr : ''}${eventData?.location ? '\nLocation: ' + eventData.location : ''}`;
    }

    window.inviteState.defaultSmsMessage = smsMsg;
    window.inviteState.defaultEmailSubject = emailSubject;
    window.inviteState.defaultEmailBody = emailBody;

    document.getElementById('inviteSmsBody').value = smsMsg;
    document.getElementById('inviteEmailSubject').value = emailSubject;
    document.getElementById('inviteEmailBody').value = emailBody;
    updateInviteSmsCharCount();
}

// Format date for display
function formatDateForDisplay(dateStr) {
    if (!dateStr) return 'TBD';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Format time for display
function formatTimeForDisplay(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes}${ampm}`;
}

// Switch invite tab
function switchInviteTab(tab) {
    document.querySelectorAll('.invite-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.invite-tab-content').forEach(c => c.classList.remove('active'));

    document.querySelector(`.invite-tab[data-tab="${tab}"]`)?.classList.add('active');
    document.getElementById(`inviteTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)?.classList.add('active');
}
window.switchInviteTab = switchInviteTab;

// Load band members for invite modal
async function loadInviteBandMembers(bandId) {
    const container = document.getElementById('inviteBandMembersList');
    if (!bandId) {
        container.innerHTML = '<div class="invite-empty-state">No band selected</div>';
        return;
    }

    container.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const membersQuery = query(
            collection(db, "bandMembers"),
            where("bandId", "==", bandId),
            where("status", "==", "accepted")
        );
        const membersSnap = await getDocs(membersQuery);

        const members = [];
        for (const memberDoc of membersSnap.docs) {
            const member = memberDoc.data();
            // Try to get phone from user profile if they have a userId
            let phone = member.phone || null;
            if (member.userId && !phone) {
                const userDoc = await getDoc(doc(db, "users", member.userId));
                if (userDoc.exists()) {
                    phone = userDoc.data().phone || null;
                }
            }
            members.push({
                name: member.name,
                email: member.email || null,
                phone: phone,
                tempoUserId: member.userId || null
            });
        }

        if (members.length === 0) {
            container.innerHTML = '<div class="invite-empty-state">No band members found</div>';
            return;
        }

        container.innerHTML = members.map(m => renderInviteRecipientItem(m)).join('');
    } catch (error) {
        console.error("Error loading band members:", error);
        container.innerHTML = '<div class="invite-empty-state">Error loading members</div>';
    }
}

// Load user's contacts for invite modal
async function loadInviteContacts() {
    const container = document.getElementById('inviteContactsList');
    container.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const contactsRef = collection(db, `users/${window.currentUser.uid}/contacts`);
        const contactsSnap = await getDocs(contactsRef);

        window.userContacts = [];
        contactsSnap.forEach(doc => {
            window.userContacts.push({ id: doc.id, ...doc.data() });
        });

        if (window.userContacts.length === 0) {
            container.innerHTML = '<div class="invite-empty-state">No contacts yet. Add some in the "Add New" tab.</div>';
            return;
        }

        renderInviteContactsList();
    } catch (error) {
        console.error("Error loading contacts:", error);
        container.innerHTML = '<div class="invite-empty-state">Error loading contacts</div>';
    }
}

// Render contacts list (with optional filtering)
function renderInviteContactsList() {
    const container = document.getElementById('inviteContactsList');
    const searchTerm = (document.getElementById('inviteContactsSearch')?.value || '').toLowerCase();

    const filtered = window.userContacts.filter(c =>
        c.name?.toLowerCase().includes(searchTerm) ||
        c.phone?.includes(searchTerm) ||
        c.email?.toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
        container.innerHTML = '<div class="invite-empty-state">No matching contacts</div>';
        return;
    }

    container.innerHTML = filtered.map(c => renderInviteRecipientItem({
        name: c.name,
        email: c.email || null,
        phone: c.phone || null,
        tempoUserId: c.tempoUserId || null
    })).join('');
}

// Filter contacts on search input
function filterInviteContacts() {
    renderInviteContactsList();
}
window.filterInviteContacts = filterInviteContacts;

// Render a single recipient item
function renderInviteRecipientItem(recipient) {
    const hasEmail = !!recipient.email;
    const hasPhone = !!recipient.phone;
    const isSelected = window.inviteState.selectedRecipients.some(r =>
        (r.email && r.email === recipient.email) || (r.phone && r.phone === recipient.phone)
    );

    const emailBadge = hasEmail ? '<span class="channel-badge email">Email</span>' : '';
    const smsBadge = hasPhone ? '<span class="channel-badge sms">SMS</span>' : '';
    const noBadge = (!hasEmail && !hasPhone) ? '<span class="channel-badge none">No contact info</span>' : '';

    return `
        <div class="invite-recipient-item ${isSelected ? 'selected' : ''} ${!hasEmail && !hasPhone ? 'disabled' : ''}"
             onclick="toggleInviteRecipient('${escapeHtml(recipient.name)}', '${recipient.email || ''}', '${recipient.phone || ''}', '${recipient.tempoUserId || ''}')">
            <div class="invite-recipient-check">
                ${isSelected ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
            </div>
            <div class="invite-recipient-info">
                <div class="invite-recipient-name">${escapeHtml(recipient.name)}</div>
                <div class="invite-recipient-channels">${emailBadge}${smsBadge}${noBadge}</div>
            </div>
        </div>
    `;
}

// Toggle recipient selection
function toggleInviteRecipient(name, email, phone, tempoUserId) {
    if (!email && !phone) return; // Can't select without contact info

    const existing = window.inviteState.selectedRecipients.findIndex(r =>
        (email && r.email === email) || (phone && r.phone === phone)
    );

    if (existing >= 0) {
        window.inviteState.selectedRecipients.splice(existing, 1);
    } else {
        window.inviteState.selectedRecipients.push({
            name,
            email: email || null,
            phone: phone || null,
            tempoUserId: tempoUserId || null
        });
    }

    // Re-render all lists to update check marks
    const bandContainer = document.getElementById('inviteBandMembersList');
    if (bandContainer && !bandContainer.querySelector('.invite-empty-state')) {
        // Refresh band list
        if (window.inviteState.eventData?.bandId) {
            loadInviteBandMembers(window.inviteState.eventData.bandId);
        }
    }
    renderInviteContactsList();
    renderInviteSelectedRecipients();
    updateInviteDeliveryPreview();
}
window.toggleInviteRecipient = toggleInviteRecipient;

// Render selected recipients
function renderInviteSelectedRecipients() {
    const container = document.getElementById('inviteSelectedList');
    const count = document.getElementById('inviteSelectedCount');
    const recipients = window.inviteState.selectedRecipients;

    count.textContent = recipients.length;

    if (recipients.length === 0) {
        container.innerHTML = '<div class="invite-selected-empty">No recipients selected</div>';
        return;
    }

    container.innerHTML = recipients.map(r => `
        <div class="invite-selected-chip">
            <span>${escapeHtml(r.name)}</span>
            <button class="chip-remove" onclick="removeInviteRecipient('${r.email || ''}', '${r.phone || ''}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
    `).join('');
}

// Remove a recipient
function removeInviteRecipient(email, phone) {
    const idx = window.inviteState.selectedRecipients.findIndex(r =>
        (email && r.email === email) || (phone && r.phone === phone)
    );
    if (idx >= 0) {
        window.inviteState.selectedRecipients.splice(idx, 1);
        renderInviteSelectedRecipients();
        updateInviteDeliveryPreview();
        // Refresh lists
        renderInviteContactsList();
    }
}
window.removeInviteRecipient = removeInviteRecipient;

// Clear all recipients
function clearAllInviteRecipients() {
    window.inviteState.selectedRecipients = [];
    renderInviteSelectedRecipients();
    updateInviteDeliveryPreview();
    renderInviteContactsList();
}
window.clearAllInviteRecipients = clearAllInviteRecipients;

// Add manual recipient
function addManualInviteRecipient() {
    const name = document.getElementById('inviteManualName').value.trim();
    const email = document.getElementById('inviteManualEmail').value.trim().toLowerCase();
    const phoneRaw = document.getElementById('inviteManualPhone').value.trim();
    const phone = phoneRaw ? normalizePhoneNumber(phoneRaw) : null;

    if (!name) {
        alert('Please enter a name');
        return;
    }
    if (!email && !phone) {
        alert('Please enter an email or phone number');
        return;
    }

    const hasValidEmail = email && email.includes('@');
    const hasValidPhone = phone && phone.startsWith('+1') && phone.length === 12;

    if (!hasValidEmail && !hasValidPhone) {
        alert('Please enter a valid email or phone number');
        return;
    }

    // Check for duplicate
    const isDuplicate = window.inviteState.selectedRecipients.some(r =>
        (hasValidEmail && r.email === email) || (hasValidPhone && r.phone === phone)
    );

    if (isDuplicate) {
        alert('This recipient is already added');
        return;
    }

    window.inviteState.selectedRecipients.push({
        name,
        email: hasValidEmail ? email : null,
        phone: hasValidPhone ? phone : null,
        tempoUserId: null
    });

    // Clear inputs
    document.getElementById('inviteManualName').value = '';
    document.getElementById('inviteManualEmail').value = '';
    document.getElementById('inviteManualPhone').value = '';

    renderInviteSelectedRecipients();
    updateInviteDeliveryPreview();
}
window.addManualInviteRecipient = addManualInviteRecipient;

// Update delivery preview
function updateInviteDeliveryPreview() {
    const sendViaSms = document.getElementById('sendViaSms').checked;
    const sendViaEmail = document.getElementById('sendViaEmail').checked;
    const recipients = window.inviteState.selectedRecipients;

    const smsEligible = recipients.filter(r => r.phone).length;
    const emailEligible = recipients.filter(r => r.email).length;

    document.getElementById('smsEligibleCount').textContent = `(${smsEligible} eligible)`;
    document.getElementById('emailEligibleCount').textContent = `(${emailEligible} eligible)`;

    // Show/hide message sections
    document.getElementById('smsMessageSection').style.display = sendViaSms ? 'block' : 'none';
    document.getElementById('emailMessageSection').style.display = sendViaEmail ? 'block' : 'none';

    // Update preview
    renderInvitePreview(sendViaSms, sendViaEmail, smsEligible, emailEligible);
}
window.updateInviteDeliveryPreview = updateInviteDeliveryPreview;

// Render preview
function renderInvitePreview(sendViaSms, sendViaEmail, smsEligible, emailEligible) {
    const preview = document.getElementById('invitePreview');
    let html = '';

    if (sendViaSms && smsEligible > 0) {
        const smsBody = document.getElementById('inviteSmsBody').value;
        html += `
            <div class="invite-preview-card sms">
                <div class="preview-header"><span class="preview-icon">💬</span> SMS to ${smsEligible} recipient${smsEligible > 1 ? 's' : ''}</div>
                <div class="preview-body">${escapeHtml(smsBody.substring(0, 100))}${smsBody.length > 100 ? '...' : ''}</div>
            </div>
        `;
    }

    if (sendViaEmail && emailEligible > 0) {
        const emailSubject = document.getElementById('inviteEmailSubject').value;
        html += `
            <div class="invite-preview-card email">
                <div class="preview-header"><span class="preview-icon">📧</span> Email to ${emailEligible} recipient${emailEligible > 1 ? 's' : ''}</div>
                <div class="preview-subject">Subject: ${escapeHtml(emailSubject)}</div>
            </div>
        `;
    }

    if (!html) {
        html = '<div class="invite-preview-empty">Select recipients and delivery methods to see preview</div>';
    }

    preview.innerHTML = html;
}

// Update SMS character count
function updateInviteSmsCharCount() {
    const textarea = document.getElementById('inviteSmsBody');
    const count = document.getElementById('inviteSmsCharCount');
    count.textContent = textarea.value.length;
}
window.updateInviteSmsCharCount = updateInviteSmsCharCount;

// Reset to default messages
function resetToDefaultSmsMessage() {
    document.getElementById('inviteSmsBody').value = window.inviteState.defaultSmsMessage;
    updateInviteSmsCharCount();
}
window.resetToDefaultSmsMessage = resetToDefaultSmsMessage;

function resetToDefaultEmailMessage() {
    document.getElementById('inviteEmailSubject').value = window.inviteState.defaultEmailSubject;
    document.getElementById('inviteEmailBody').value = window.inviteState.defaultEmailBody;
}
window.resetToDefaultEmailMessage = resetToDefaultEmailMessage;

// Send unified invites
async function sendUnifiedInvites() {
    const recipients = window.inviteState.selectedRecipients;
    if (recipients.length === 0) {
        alert('Please select at least one recipient');
        return;
    }

    const sendViaSms = document.getElementById('sendViaSms').checked;
    const sendViaEmail = document.getElementById('sendViaEmail').checked;

    if (!sendViaSms && !sendViaEmail) {
        alert('Please select at least one delivery method');
        return;
    }

    const btn = document.getElementById('sendInvitesBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
        const results = { smsSent: 0, emailSent: 0 };

        // Send SMS invites
        if (sendViaSms) {
            const smsRecipients = recipients.filter(r => r.phone);
            if (smsRecipients.length > 0) {
                const smsMessage = document.getElementById('inviteSmsBody').value;
                const smsResult = await sendBulkSmsForInvites(smsRecipients, smsMessage);
                results.smsSent = smsResult.sent || 0;
            }
        }

        // Send email invites
        if (sendViaEmail) {
            const emailRecipients = recipients.filter(r => r.email);
            if (emailRecipients.length > 0) {
                const emailSubject = document.getElementById('inviteEmailSubject').value;
                const emailBody = document.getElementById('inviteEmailBody').value;
                const emailResult = await sendBulkEmailForInvites(emailRecipients, emailSubject, emailBody);
                results.emailSent = emailResult.sent || 0;
            }
        }

        // Show success message
        const parts = [];
        if (results.smsSent > 0) parts.push(`${results.smsSent} SMS`);
        if (results.emailSent > 0) parts.push(`${results.emailSent} email`);
        alert(`Sent ${parts.join(' and ')} invite${parts.length > 1 || (results.smsSent + results.emailSent) > 1 ? 's' : ''}!`);

        closeUnifiedInviteModal();

    } catch (error) {
        console.error('Error sending invites:', error);
        alert('Failed to send some invites: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Send Invites';
    }
}
window.sendUnifiedInvites = sendUnifiedInvites;

// Send bulk SMS for invites
async function sendBulkSmsForInvites(recipients, message) {
    // Build recipients list - assume first contact for safety (includes opt-out message)
    const recipientsWithStatus = recipients.map(r => ({
        phone: r.phone,
        name: r.name,
        isFirstContact: true // Always include opt-out info for compliance
    }));

    // Get auth token
    const idToken = await window.currentUser.getIdToken();

    // Call HTTP endpoint directly
    const response = await fetch('https://us-central1-bandcal-89c81.cloudfunctions.net/sendBulkSMS', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
            recipients: recipientsWithStatus,
            messageTemplate: message,
            referenceType: window.inviteState.eventType,
            referenceId: window.inviteState.eventId,
            messageType: 'invite'
        })
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error || 'Failed to send SMS');
    }

    return result;
}

// Send bulk email for invites
async function sendBulkEmailForInvites(recipients, subject, bodyText) {
    let sent = 0;
    const eventType = window.inviteState.eventType;
    const eventId = window.inviteState.eventId;

    // Generate invite URL based on event type
    let inviteUrl = window.location.origin;
    if (eventType === 'band') {
        inviteUrl += `?joinBand=${eventId}`;
    } else if (eventType === 'gig') {
        inviteUrl += `/e/${eventId}`;
    } else if (eventType === 'rehearsal') {
        inviteUrl += `/r/${eventId}`;
    }

    for (const r of recipients) {
        try {
            await addDoc(collection(db, "mail"), {
                to: r.email,
                message: {
                    subject: subject,
                    html: generateInviteEmailHtml(r.name, bodyText, inviteUrl, eventType)
                }
            });
            sent++;
        } catch (error) {
            console.error(`Failed to queue email for ${r.email}:`, error);
        }
    }

    return { sent };
}

// Generate email HTML with link previews
function generateInviteEmailHtml(recipientName, bodyText, inviteUrl, eventType) {
    const buttonLabels = {
        band: 'Join Band',
        gig: 'View Gig Details',
        rehearsal: 'View Rehearsal & RSVP'
    };

    // Detect URLs in the body text and convert to styled links
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    let bodyHtml = escapeHtml(bodyText);
    const urls = bodyText.match(urlRegex) || [];

    urls.forEach(url => {
        const escapedUrl = escapeHtml(url);
        const displayUrl = url.length > 50 ? url.substring(0, 50) + '...' : url;
        const linkHtml = `<a href="${escapedUrl}" style="color: #4CAF50; text-decoration: underline;">${escapeHtml(displayUrl)}</a>`;
        bodyHtml = bodyHtml.replace(escapedUrl, linkHtml);
    });

    return `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">Hey ${escapeHtml(recipientName)}!</h2>
            <p style="color: #555; font-size: 16px; line-height: 1.6; white-space: pre-line;">${bodyHtml}</p>
            <p style="margin: 30px 0;">
                <a href="${inviteUrl}" style="background: #4CAF50; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 500; display: inline-block;">
                    ${buttonLabels[eventType] || 'View Details'}
                </a>
            </p>
            <p style="color: #888; font-size: 14px;">Sent via Tempo</p>
        </div>
    `;
}

// ============================================
// EDIT BAND MEMBER MODAL
// ============================================

window.editMemberState = {
    memberId: null,
    originalEmail: null,
    originalPhone: null
};

function openEditMemberModal(memberId, memberName, email, phone) {
    window.editMemberState = {
        memberId: memberId,
        originalEmail: email || '',
        originalPhone: phone || ''
    };

    document.getElementById('editMemberName').textContent = memberName;
    document.getElementById('editMemberEmail').value = email || '';
    document.getElementById('editMemberPhone').value = phone ? formatPhoneDisplay(phone) : '';

    document.getElementById('editMemberModal').classList.add('active');
}
window.openEditMemberModal = openEditMemberModal;

function closeEditMemberModal() {
    document.getElementById('editMemberModal').classList.remove('active');
    window.editMemberState = { memberId: null, originalEmail: null, originalPhone: null };
}
window.closeEditMemberModal = closeEditMemberModal;

async function saveEditMember() {
    const memberId = window.editMemberState.memberId;
    if (!memberId) return;

    const email = document.getElementById('editMemberEmail').value.trim().toLowerCase();
    const phoneRaw = document.getElementById('editMemberPhone').value.trim();
    const phone = phoneRaw ? normalizePhoneNumber(phoneRaw) : null;

    // Validate email if provided
    if (email && !email.includes('@')) {
        alert('Please enter a valid email address');
        return;
    }

    const btn = document.getElementById('saveEditMemberBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const updateData = {
            email: email || null
        };

        if (phone) {
            updateData.phone = phone;
        } else {
            updateData.phone = null;
        }

        await updateDoc(doc(db, "bandMembers", memberId), updateData);

        closeEditMemberModal();

        // Reload band members
        const bandDoc = await getDoc(doc(db, "bands", window.currentBandId));
        const band = bandDoc.data();
        const userId = window.currentUser?.uid;
        const isLeader = band.leaderId === userId;
        const isTempAdmin = band.tempAdminId === userId && band.leaderStatus === 'pending';
        await loadBandMembers(window.currentBandId, isLeader || isTempAdmin, band);

    } catch (error) {
        console.error("Error saving member:", error);
        alert("Error saving: " + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save';
    }
}
window.saveEditMember = saveEditMember;

// ============================================
// PHONE & CONTACTS HELPERS
// ============================================

// Normalize phone number to E.164
function normalizePhoneNumber(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
        return '+1' + digits;
    } else if (digits.length === 11 && digits.startsWith('1')) {
        return '+' + digits;
    }
    return null;
}

// Format phone for display
function formatPhoneDisplay(phone) {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
        return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    } else if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phone;
}

// Format phone input as user types: (XXX) XXX-XXXX
function formatPhoneInput(input) {
    // Get just the digits
    let digits = input.value.replace(/\D/g, '');

    // Limit to 10 digits (or 11 if starts with 1)
    if (digits.length > 11) {
        digits = digits.slice(0, 11);
    }
    if (digits.length > 10 && !digits.startsWith('1')) {
        digits = digits.slice(0, 10);
    }

    // Remove leading 1 for formatting
    let formatDigits = digits;
    if (digits.startsWith('1') && digits.length > 1) {
        formatDigits = digits.slice(1);
    }

    // Format as (XXX) XXX-XXXX
    let formatted = '';
    if (formatDigits.length > 0) {
        formatted = '(' + formatDigits.slice(0, 3);
    }
    if (formatDigits.length >= 3) {
        formatted += ') ' + formatDigits.slice(3, 6);
    }
    if (formatDigits.length >= 6) {
        formatted += '-' + formatDigits.slice(6, 10);
    }

    input.value = formatted;
}
window.formatPhoneInput = formatPhoneInput;

// Show add contacts modal
function showAddContactsModal() {
    document.getElementById('addContactsModal').classList.add('active');
}
window.showAddContactsModal = showAddContactsModal;

// Close add contacts modal
function closeAddContactsModal() {
    document.getElementById('addContactsModal').classList.remove('active');
    if (typeof loadInviteContacts === 'function') loadInviteContacts();
}
window.closeAddContactsModal = closeAddContactsModal;

// Save new contact
async function saveNewContact() {
    const name = document.getElementById('newContactName').value.trim();
    const phone = document.getElementById('newContactPhone').value.trim();

    if (!name || !phone) {
        alert('Please enter both name and phone number');
        return;
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) {
        alert('Please enter a valid US phone number');
        return;
    }

    try {
        await addDoc(collection(db, `users/${window.currentUser.uid}/contacts`), {
            name,
            phone: normalizedPhone,
            tempoUserId: null,
            importedAt: serverTimestamp(),
            source: 'manual'
        });

        document.getElementById('newContactName').value = '';
        document.getElementById('newContactPhone').value = '';
        alert('Contact added!');
        if (typeof loadInviteContacts === 'function') loadInviteContacts();
    } catch (error) {
        console.error('Error saving contact:', error);
        alert('Error saving contact: ' + error.message);
    }
}
window.saveNewContact = saveNewContact;

// Parse and save pasted contacts
async function parseAndSavePastedContacts() {
    const text = document.getElementById('pasteContactsArea').value.trim();
    if (!text) {
        alert('Please paste contact information');
        return;
    }

    const lines = text.split('\n').filter(l => l.trim());
    let saved = 0;

    for (const line of lines) {
        const parts = line.split(/[,\t]+/).map(p => p.trim());
        if (parts.length >= 2) {
            const name = parts[0];
            const phone = normalizePhoneNumber(parts[1]);

            if (name && phone) {
                try {
                    await addDoc(collection(db, `users/${window.currentUser.uid}/contacts`), {
                        name,
                        phone,
                        tempoUserId: null,
                        importedAt: serverTimestamp(),
                        source: 'paste'
                    });
                    saved++;
                } catch (e) {
                    console.error('Error saving contact:', e);
                }
            }
        }
    }

    document.getElementById('pasteContactsArea').value = '';
    alert(`Imported ${saved} contact${saved !== 1 ? 's' : ''}`);
    if (typeof loadInviteContacts === 'function') loadInviteContacts();
}
window.parseAndSavePastedContacts = parseAndSavePastedContacts;
