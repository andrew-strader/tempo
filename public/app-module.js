// Import Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, connectFirestoreEmulator, collection, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, query, where, serverTimestamp, onSnapshot, orderBy, increment, limit as firestoreLimit } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-storage.js";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

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
const googleProvider = new GoogleAuthProvider();

// Connect to emulators when running locally
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
if (isLocalhost) {
    console.log('🔧 Running locally - connecting to Firebase emulators');
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
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

// Google Sign In
window.signInWithGoogle = async function() {
    try {
        if (isMobile()) {
            // Save pending actions to localStorage before redirect
            if (window.pendingBandJoin) {
                localStorage.setItem('pendingBandJoin', window.pendingBandJoin);
            }
            if (window.pendingLeaderAccept) {
                localStorage.setItem('pendingLeaderAccept', window.pendingLeaderAccept);
            }
            if (window.pendingBandInviteId) {
                localStorage.setItem('pendingBandInviteId', window.pendingBandInviteId);
            }
            
            // Use redirect on mobile (popups don't work well)
            await signInWithRedirect(auth, googleProvider);
            return null; // Will return after redirect
        } else {
            const result = await signInWithPopup(auth, googleProvider);
            window.currentUser = result.user;
            console.log("Signed in:", result.user.email);
            return result.user;
        }
    } catch (error) {
        console.error("Sign in error:", error);
        alert("Sign in failed: " + error.message);
        return null;
    }
};

// Handle redirect result (for mobile sign-in)
getRedirectResult(auth).then((result) => {
    if (result && result.user) {
        window.currentUser = result.user;
        console.log("Signed in via redirect:", result.user.email);
    }
}).catch((error) => {
    if (error.code !== 'auth/popup-closed-by-user') {
        console.error("Redirect sign in error:", error);
    }
});

// Sign Out
window.signOutUser = async function() {
    try {
        await signOut(auth);
        window.currentUser = null;
        showHomeScreen();
    } catch (error) {
        console.error("Sign out error:", error);
    }
};

// Auth state listener
onAuthStateChanged(auth, async (user) => {
    window.currentUser = user;
    
    // Check for profile when user is logged in (do this BEFORE updating UI)
    if (user) {
        const profile = await checkUserProfile(user);
        window.currentUserProfile = profile;
    } else {
        window.currentUserProfile = null;
        
        // Prompt sign in if there are pending band actions
        if (window.pendingBandJoin) {
            setTimeout(() => {
                alert('Please sign in to join the band');
                signInWithGoogleAndCheckProfile();
            }, 300);
        } else if (window.pendingLeaderAccept) {
            setTimeout(() => {
                alert('Please sign in to accept the band leader invitation');
                signInWithGoogleAndCheckProfile();
            }, 300);
        }
    }
    
    // Now update UI with profile data available
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
    } else if (user && window.pendingShowConnections) {
        window.pendingShowConnections = false;
        showConnections();
    } else if (user && window.pendingShowMessages) {
        window.pendingShowMessages = false;
        showConversations();
    } else if (user && window.pendingChatConversationId) {
        const conversationId = window.pendingChatConversationId;
        window.pendingChatConversationId = null;
        // Extract other user ID from conversation ID
        const parts = conversationId.split('_');
        const otherUserId = parts.find(p => p !== user.uid);
        if (otherUserId) showChat(conversationId, otherUserId);
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

// Modified sign in to check for profile
window.signInWithGoogleAndCheckProfile = async function() {
    const user = await window.signInWithGoogle();
    // On mobile, redirect is used and this returns null
    // The auth state listener will handle things when user returns
    if (user) {
        const profile = await checkUserProfile(user);
        if (!profile) {
            // New user, show profile setup
            showProfileSetup();
            return user;
        }
    }
    return user;
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
    
    // Check if we should show "What's New" modal
    setTimeout(() => {
        if (window.checkWhatsNew) checkWhatsNew();
    }, 500);
}

window.showHomeScreen = showHomeScreen;

// Handle browser back/forward buttons
window.addEventListener('popstate', function(event) {
    const path = window.location.pathname;
    
    if (path === '/' || path === '') {
        // Clean up any active chat listener
        if (window.unsubscribeFromMessages) unsubscribeFromMessages();
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screenFeed = document.getElementById('screenFeed');
        if (screenFeed) screenFeed.classList.add('active');
        // Restore header and tab bar
        document.getElementById('globalHeader').style.display = '';
        document.body.classList.remove('hide-tab-bar');
        loadSocialFeed();
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
    } else if (path === '/privacy') {
        showPrivacy();
    } else if (path === '/terms') {
        showTerms();
    } else if (path.match(/^\/band\/([a-zA-Z0-9]+)$/)) {
        const bandId = path.split('/')[2];
        if (window.currentUser) showBandDetail(bandId);
    } else if (path.match(/^\/b\/([a-zA-Z0-9]+)$/)) {
        const bandId = path.split('/')[2];
        showBandInviteLanding(bandId);
    } else if (path === '/new-rehearsal') {
        if (window.currentUser) showCreateRehearsal();
    } else if (path === '/connections') {
        if (window.currentUser) showConnections();
    } else if (path === '/messages') {
        if (window.currentUser) showConversations();
    } else if (path.match(/^\/chat\/([a-zA-Z0-9_]+)$/)) {
        const conversationId = path.split('/')[2];
        // Extract other user ID from conversation ID
        const parts = conversationId.split('_');
        const otherUserId = parts.find(p => p !== window.currentUser?.uid);
        if (window.currentUser && otherUserId) showChat(conversationId, otherUserId);
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

function goToPrivacy() {
    toggleMenu();
    showPrivacy();
}
window.goToPrivacy = goToPrivacy;

function showPrivacy() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screenPrivacy').classList.add('active');
}
window.showPrivacy = showPrivacy;

function goBackFromPrivacy() {
    showHomeScreen();
}
window.goBackFromPrivacy = goBackFromPrivacy;

function goToTerms() {
    toggleMenu();
    showTerms();
}
window.goToTerms = goToTerms;

function showTerms() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screenTerms').classList.add('active');
}
window.showTerms = showTerms;

function goBackFromTerms() {
    showHomeScreen();
}
window.goBackFromTerms = goBackFromTerms;

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
    const menuConnections = document.getElementById('menuConnections');
    const menuMessages = document.getElementById('menuMessages');
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
        if (menuConnections) menuConnections.style.display = 'flex';
        if (menuMessages) menuMessages.style.display = 'flex';
        if (menuProfileDivider) menuProfileDivider.style.display = 'block';
        // Update pending connection badge
        updatePendingBadge();
        // Update messages badge
        if (window.updateMessagesBadge) updateMessagesBadge();
    } else {
        menuUserInfo.style.display = 'none';
        menuSignIn.style.display = 'flex';
        menuSignOut.style.display = 'none';
        // Hide profile options for logged out users
        if (menuEditProfile) menuEditProfile.style.display = 'none';
        if (menuViewProfile) menuViewProfile.style.display = 'none';
        if (menuConnections) menuConnections.style.display = 'none';
        if (menuMessages) menuMessages.style.display = 'none';
        if (menuProfileDivider) menuProfileDivider.style.display = 'none';
    }
}

// Menu navigation functions
function goToFindMusicians() {
    toggleMenu();
    showMusicianDiscovery();
}
window.goToFindMusicians = goToFindMusicians;

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

// Save new profile
async function saveProfile() {
    const name = document.getElementById('profileName').value.trim();
    const location = document.getElementById('profileLocation').value.trim();
    const bio = document.getElementById('profileBio').value.trim();
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
            location,
            bio,
            instruments,
            discoverable,
            photoURL,
            photos,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

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
    
    if (!name) {
        alert('Please enter your name');
        return;
    }
    
    if (instruments.length === 0) {
        alert('Please select at least one instrument');
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

// Initialize photo carousel on profile view
function initPhotoCarousel(photos) {
    const carousel = document.getElementById('photoCarousel');
    const carouselTrack = document.getElementById('carouselTrack');
    const carouselIndicators = document.getElementById('carouselIndicators');
    const carouselPrev = document.getElementById('carouselPrev');
    const carouselNext = document.getElementById('carouselNext');

    if (!carouselTrack) return;

    window.currentCarouselIndex = 0;
    window.viewerPhotos = photos || []; // Store for photo viewer

    if (!photos || photos.length === 0) {
        // No photos - show placeholder
        carouselTrack.innerHTML = `
            <div class="carousel-slide active">
                <div class="profile-avatar-placeholder" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>
                </div>
            </div>
        `;
        carouselIndicators.innerHTML = '';
        if (carouselPrev) carouselPrev.style.display = 'none';
        if (carouselNext) carouselNext.style.display = 'none';
        return;
    }

    // Render slides
    carouselTrack.innerHTML = photos.map((photo, index) => `
        <div class="carousel-slide ${index === 0 ? 'active' : ''}" data-index="${index}">
            <img src="${photo.url}" alt="Profile photo ${index + 1}" onerror="this.parentElement.innerHTML='<div class=\\'carousel-slide-placeholder\\'><svg width=\\'48\\' height=\\'48\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><circle cx=\\'12\\' cy=\\'8\\' r=\\'4\\'/><path d=\\'M4 20c0-4 4-6 8-6s8 2 8 6\\'/></svg></div>'">
        </div>
    `).join('');

    // Render indicators (bar style at top)
    if (photos.length > 1) {
        carouselIndicators.innerHTML = photos.map((_, index) => `
            <button class="carousel-dot ${index === 0 ? 'active' : ''}" onclick="event.stopPropagation(); carouselGoTo(${index})" aria-label="Go to photo ${index + 1}"></button>
        `).join('');
        if (carouselPrev) carouselPrev.style.display = 'flex';
        if (carouselNext) carouselNext.style.display = 'flex';
    } else {
        carouselIndicators.innerHTML = '';
        if (carouselPrev) carouselPrev.style.display = 'none';
        if (carouselNext) carouselNext.style.display = 'none';
    }

    // Click to open full-screen viewer
    if (carousel) {
        carousel.onclick = function(e) {
            // Don't open viewer if clicking nav buttons
            if (e.target.closest('.carousel-nav') || e.target.closest('.carousel-dot')) {
                return;
            }
            openPhotoViewer(window.currentCarouselIndex);
        };
    }

    // Set up touch handlers for swipe
    setupCarouselTouch();
}
window.initPhotoCarousel = initPhotoCarousel;

// Navigate carousel
function carouselNavigate(direction) {
    const slides = document.querySelectorAll('.carousel-slide');
    if (slides.length <= 1) return;

    const totalSlides = slides.length;
    window.currentCarouselIndex = (window.currentCarouselIndex + direction + totalSlides) % totalSlides;

    updateCarouselPosition();
}
window.carouselNavigate = carouselNavigate;

// Go to specific carousel slide
function carouselGoTo(index) {
    window.currentCarouselIndex = index;
    updateCarouselPosition();
}
window.carouselGoTo = carouselGoTo;

// Update carousel visual position
function updateCarouselPosition() {
    const track = document.getElementById('carouselTrack');
    const slides = document.querySelectorAll('.carousel-slide');
    const dots = document.querySelectorAll('.carousel-dot');

    if (!track) return;

    // Update slide positions
    track.style.transform = `translateX(-${window.currentCarouselIndex * 100}%)`;

    // Update active states
    slides.forEach((slide, i) => {
        slide.classList.toggle('active', i === window.currentCarouselIndex);
    });
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === window.currentCarouselIndex);
    });
}

// Set up touch handlers for carousel swipe
function setupCarouselTouch() {
    const carousel = document.getElementById('photoCarousel');
    if (!carousel) return;

    // Prevent adding duplicate listeners
    if (carousel.dataset.touchSetup) return;
    carousel.dataset.touchSetup = 'true';

    let touchStartX = 0;
    let touchEndX = 0;

    carousel.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    carousel.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const swipeThreshold = 50;
        const diff = touchStartX - touchEndX;

        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                carouselNavigate(1);
            } else {
                carouselNavigate(-1);
            }
        }
    }, { passive: true });
}

// Photo viewer state
window.viewerPhotos = [];
window.viewerIndex = 0;

// Open photo viewer
function openPhotoViewer(index) {
    if (!window.viewerPhotos || window.viewerPhotos.length === 0) return;

    window.viewerIndex = (typeof index === 'number') ? index : (window.currentCarouselIndex || 0);
    const photo = window.viewerPhotos[window.viewerIndex];
    if (!photo) return;

    const overlay = document.getElementById('photoViewerOverlay');
    const image = document.getElementById('photoViewerImage');
    const counter = document.getElementById('photoViewerCounter');
    const prevBtn = document.getElementById('viewerPrev');
    const nextBtn = document.getElementById('viewerNext');

    if (!overlay || !image) return;

    image.src = photo.url;
    if (counter) counter.textContent = `${window.viewerIndex + 1} / ${window.viewerPhotos.length}`;

    // Show/hide nav buttons
    if (window.viewerPhotos.length <= 1) {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        counter.style.display = 'none';
    } else {
        prevBtn.style.display = 'flex';
        nextBtn.style.display = 'flex';
        counter.style.display = 'block';
    }

    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
}
window.openPhotoViewer = openPhotoViewer;

// Open photo viewer with a single image URL
function viewSingleImage(imageUrl) {
    window.viewerPhotos = [{ url: imageUrl }];
    window.viewerIndex = 0;
    openPhotoViewer(0);
}
window.viewSingleImage = viewSingleImage;

// Close photo viewer
function closePhotoViewer(event) {
    // If event exists and target is not the overlay itself, don't close
    if (event && event.target !== event.currentTarget && !event.target.classList.contains('photo-viewer-close')) {
        return;
    }

    const overlay = document.getElementById('photoViewerOverlay');
    overlay.classList.remove('visible');
    document.body.style.overflow = '';
}
window.closePhotoViewer = closePhotoViewer;

// Navigate in photo viewer
function viewerNavigate(direction, event) {
    if (event) {
        event.stopPropagation();
    }

    const total = window.viewerPhotos.length;
    if (total <= 1) return;

    window.viewerIndex = (window.viewerIndex + direction + total) % total;

    const photo = window.viewerPhotos[window.viewerIndex];
    const image = document.getElementById('photoViewerImage');
    const counter = document.getElementById('photoViewerCounter');

    image.src = photo.url;
    counter.textContent = `${window.viewerIndex + 1} / ${window.viewerPhotos.length}`;
}
window.viewerNavigate = viewerNavigate;

// Keyboard navigation for photo viewer
document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('photoViewerOverlay');
    if (!overlay || !overlay.classList.contains('visible')) return;

    if (e.key === 'Escape') {
        closePhotoViewer();
    } else if (e.key === 'ArrowLeft') {
        viewerNavigate(-1);
    } else if (e.key === 'ArrowRight') {
        viewerNavigate(1);
    }
});

// Handle profile photo selection
async function handleProfilePhotoSelect(event, mode) {
    let file = event.target.files[0];
    if (!file) return;

    // Reset file input so same file can be selected again
    event.target.value = '';

    // Check if at limit
    if (window.pendingProfilePhotos.length >= 5) {
        alert('Maximum 5 photos allowed');
        return;
    }

    // Check if HEIC and convert
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif' ||
                   file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');

    if (isHeic) {
        try {
            console.log('Converting HEIC to PNG...');
            let result = await heic2any({
                blob: file,
                toType: 'image/png'
            });
            // heic2any can return an array for multi-image HEIC files
            const blob = Array.isArray(result) ? result[0] : result;
            file = new File([blob], file.name.replace(/\.heic$/i, '.png').replace(/\.heif$/i, '.png'), { type: 'image/png' });
            console.log('HEIC conversion complete, size:', file.size);
        } catch (error) {
            console.error('HEIC conversion failed:', error);
            alert('Could not convert HEIC image. Please try a JPEG or PNG.');
            return;
        }
    }

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

// Show musician discovery screen
async function showMusicianDiscovery() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screenMusicianDiscovery').classList.add('active');
    hideGlobalHeader();
    
    // Load all discoverable musicians initially
    searchMusicians();
}
window.showMusicianDiscovery = showMusicianDiscovery;

// Search musicians
async function searchMusicians() {
    const instrument = document.getElementById('filterInstrument').value;
    const locationFilter = document.getElementById('filterLocation').value.toLowerCase().trim();
    
    const resultsDiv = document.getElementById('musicianResults');
    resultsDiv.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';
    
    try {
        let q;
        if (instrument) {
            q = query(
                collection(db, "users"),
                where("discoverable", "==", true),
                where("instruments", "array-contains", instrument)
            );
        } else {
            q = query(
                collection(db, "users"),
                where("discoverable", "==", true)
            );
        }
        
        const querySnapshot = await getDocs(q);
        
        let musicians = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Note: Currently showing all users including yourself for testing
            // TODO: Uncomment to hide yourself: if (window.currentUser && doc.id === window.currentUser.uid) return;
            
            // Filter by location if specified
            if (locationFilter && data.location) {
                if (!data.location.toLowerCase().includes(locationFilter)) return;
            } else if (locationFilter && !data.location) {
                return;
            }
            
            musicians.push({ id: doc.id, ...data });
        });
        
        if (musicians.length === 0) {
            resultsDiv.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
                    <p>No musicians found matching your search</p>
                </div>
            `;
            return;
        }
        
        resultsDiv.innerHTML = musicians.map(m => {
            const photoURL = getPrimaryPhotoURL(m);
            return `
            <div class="musician-card" onclick="viewMusicianProfile('${m.id}')">
                <div class="musician-card-header">
                    ${photoURL
                        ? `<img src="${photoURL}" class="musician-card-avatar" onerror="this.outerHTML='<div class=\\'musician-card-avatar-placeholder\\'><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg></div>'">`
                        : `<div class="musician-card-avatar-placeholder"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg></div>`
                    }
                    <div class="musician-card-info">
                        <div class="musician-card-name">${escapeHtml(m.name)}</div>
                        ${m.location ? `<div class="musician-card-location">${escapeHtml(m.location)}</div>` : ''}
                    </div>
                </div>
                <div class="musician-card-instruments">
                    ${(m.instruments || []).map(i => `<span class="instrument-tag">${getInstrumentLabel(i)}</span>`).join('')}
                </div>
            </div>
        `;}).join('');
        
    } catch (error) {
        console.error("Error searching musicians:", error);
        resultsDiv.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/></svg></div>
                <p>Error loading musicians</p>
            </div>
        `;
    }
}
window.searchMusicians = searchMusicians;

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
            showMusicianDiscovery();
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
        try {
            initPhotoCarousel(photos);
        } catch (carouselError) {
            console.error('Error initializing carousel:', carouselError);
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
        const connectBtn = document.getElementById('connectMusicianBtn');
        const backBtn = document.getElementById('profileBackBtn');

        if (isOwnProfile) {
            contactBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M17 3l4 4L7 21H3v-4L17 3z"/></svg>Edit Profile';
            contactBtn.onclick = function() { showEditProfile(); };
            backBtn.innerHTML = 'Back to Home';
            backBtn.onclick = function() { showHomeScreen(); };
            // Hide connect and message buttons on own profile
            if (connectBtn) connectBtn.style.display = 'none';
            const messageBtn = document.getElementById('messageMusicianBtn');
            if (messageBtn) messageBtn.style.display = 'none';
        } else {
            contactBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>Contact';
            contactBtn.onclick = function() { contactMusician(); };
            backBtn.innerHTML = 'Back';
            backBtn.onclick = function() { showHomeScreen(); };

            // Show connect button and get connection status
            if (connectBtn) {
                connectBtn.style.display = 'flex';
                // Set default state immediately (in case user isn't logged in or query fails)
                updateConnectButton(userId, 'none', false, null);
                // Get connection status and update button
                getConnectionStatus(userId).then(connStatus => {
                    updateConnectButton(userId, connStatus.status, connStatus.isSentByMe, connStatus.connectionId);
                    // Show/hide message button based on connection status
                    const messageBtn = document.getElementById('messageMusicianBtn');
                    if (messageBtn) {
                        if (connStatus.status === 'accepted') {
                            messageBtn.style.display = 'flex';
                            messageBtn.onclick = () => startConversation(userId);
                        } else {
                            messageBtn.style.display = 'none';
                        }
                    }
                }).catch(err => {
                    console.error('Error getting connection status:', err);
                    // Keep default "Connect" state on error
                    const messageBtn = document.getElementById('messageMusicianBtn');
                    if (messageBtn) messageBtn.style.display = 'none';
                });
            }
        }
        
        // Store email for contact
        window.viewingMusicianEmail = profile.email;
        
    } catch (error) {
        console.error("Error loading profile:", error);
        alert('Error loading profile');
        showMusicianDiscovery();
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
        
        container.innerHTML = bands.map(band => `
            <div class="band-card" onclick="showBandDetail('${band.id}')">
                <div class="band-card-name">${escapeHtml(band.name)}</div>
                <div class="band-card-info">
                    ${band.role === 'leader' ? 'Leader' : band.role === 'admin' ? 'Admin' : 'Member'}
                    ${band.memberCount ? ` • ${band.memberCount} members` : ''}
                </div>
            </div>
        `).join('');
        
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
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screenCreateBand').classList.add('active');
    
    // Hide tab bar during creation flow
    hideTabBar();
    
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
    
    // Reset member inputs to default 3 rows
    document.getElementById('bandMemberInputs').innerHTML = `
        <div class="member-input-row">
            <input type="text" class="member-name-input" placeholder="Name">
            <input type="email" class="member-email-input" placeholder="Email">
        </div>
        <div class="member-input-row">
            <input type="text" class="member-name-input" placeholder="Name">
            <input type="email" class="member-email-input" placeholder="Email">
        </div>
        <div class="member-input-row">
            <input type="text" class="member-name-input" placeholder="Name">
            <input type="email" class="member-email-input" placeholder="Email">
        </div>
    `;
}
window.showCreateBand = showCreateBand;

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
    
    // Check if HEIC and convert
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || 
                   file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
    
    if (isHeic) {
        try {
            let result = await heic2any({
                blob: file,
                toType: 'image/png'
            });
            const blob = Array.isArray(result) ? result[0] : result;
            file = new File([blob], file.name.replace(/\.heic$/i, '.png').replace(/\.heif$/i, '.png'), { type: 'image/png' });
        } catch (error) {
            console.error('HEIC conversion failed:', error);
            alert('Could not convert image. Please try a JPEG or PNG.');
            preview.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><circle cx="19" cy="7" r="3"/><path d="M19 21v-1a3 3 0 00-3-3h-1"/></svg>';
            return;
        }
    }
    
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
        
        if (name && email && email.includes('@')) {
            members.push({ name, email });
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
                email: member.email,
                status: 'pending',
                userId: null,
                invitedAt: serverTimestamp(),
                invitedBy: window.currentUser.uid
            });
            
            // Send invite email
            await sendBandInviteEmail(member.email, member.name, name, bandRef.id);
        }
        
        console.log("Band created:", bandRef.id);
        showBandDetail(bandRef.id);
        
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
        
        // Show leader (or pending leader)
        if (band.leaderStatus === 'pending') {
            html += `
                <div class="member-item">
                    <div class="member-info">
                        <div class="member-name">${escapeHtml(band.leaderName || 'Leader')}</div>
                        <div class="member-email">${escapeHtml(band.leaderEmail || '')}</div>
                    </div>
                    <span class="member-status pending">Pending Leader</span>
                </div>
            `;
        } else {
            html += `
                <div class="member-item">
                    <div class="member-info">
                        <div class="member-name">${escapeHtml(band.leaderName || 'Leader')}</div>
                        <div class="member-email">${escapeHtml(band.leaderEmail || '')}</div>
                    </div>
                    <span class="member-status accepted">Leader</span>
                </div>
            `;
        }
        
        membersSnap.forEach(docSnap => {
            const member = docSnap.data();
            html += `
                <div class="member-item">
                    <div class="member-info">
                        <div class="member-name">${escapeHtml(member.name)}</div>
                        <div class="member-email">${escapeHtml(member.email)}</div>
                    </div>
                    <span class="member-status ${member.status}">${member.status === 'accepted' ? 'Joined' : 'Pending'}</span>
                    ${canManage ? `<button class="member-remove" onclick="removeBandMember('${docSnap.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}
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

// Check for /privacy path
const isPrivacyPage = window.location.pathname === '/privacy';

// Check for /terms path
const isTermsPage = window.location.pathname === '/terms';

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

// Check for /connections path
const isConnectionsPage = window.location.pathname === '/connections';

// Check for /messages path
const isMessagesPage = window.location.pathname === '/messages';

// Check for /chat/{conversationId} path
const chatMatch = window.location.pathname.match(/^\/chat\/([a-zA-Z0-9_]+)$/);
const chatConversationId = chatMatch ? chatMatch[1] : null;

// Check for /r/{rehearsalId} path
const rehearsalMatch = window.location.pathname.match(/^\/r\/([a-zA-Z0-9]+)$/);
const rehearsalId = rehearsalMatch ? rehearsalMatch[1] : null;

// Helper to hide feed screen
function hideFeedScreen() {
    const screenFeed = document.getElementById('screenFeed');
    if (screenFeed) screenFeed.classList.remove('active');
}

// Route to appropriate view
if (isPrivacyPage) {
    hideFeedScreen();
    showPrivacy();
} else if (isTermsPage) {
    hideFeedScreen();
    showTerms();
} else if (isBandsPage) {
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
} else if (isConnectionsPage) {
    // Will be handled after auth
    window.pendingShowConnections = true;
} else if (isMessagesPage) {
    // Will be handled after auth
    window.pendingShowMessages = true;
} else if (chatConversationId) {
    // Will be handled after auth
    window.pendingChatConversationId = chatConversationId;
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

// Evergreen Update Config - just edit this for new updates
const UPDATE_CONFIG = {
    version: "2026-01-11",
    title: "Quick heads up",
    items: [
        { title: "New home feed", desc: "discover musicians and see what's happening" },
        { title: "Bottom tabs", desc: "faster access to your gigs and bands" },
        { title: "Richer profiles", desc: "add your gear, influences, and more" }
    ],
    footer: "All your stuff is still here, just reorganized a bit."
};

// Check if user has seen the latest update
async function checkWhatsNew() {
    if (!window.currentUser || !window.currentUserProfile) return;
    
    const lastSeen = window.currentUserProfile.lastSeenUpdateVersion || "";
    
    // Show modal if they haven't seen this version
    if (lastSeen < UPDATE_CONFIG.version) {
        // Build modal content dynamically
        const modal = document.getElementById('whatsNewOverlay');
        const titleEl = modal.querySelector('.whats-new-title');
        const contentEl = modal.querySelector('.whats-new-content');
        
        titleEl.textContent = UPDATE_CONFIG.title;
        contentEl.innerHTML = `
            <p>We made some changes:</p>
            <ul>
                ${UPDATE_CONFIG.items.map(item =>
                    `<li><strong>${item.title}</strong> — ${item.desc}</li>`
                ).join('')}
            </ul>
            <p style="color: #888; font-size: 14px; margin-top: 16px;">${UPDATE_CONFIG.footer}</p>
        `;
        
        modal.classList.add('visible');
    }
}
window.checkWhatsNew = checkWhatsNew;

// Dismiss the "What's New" modal
async function dismissWhatsNew() {
    document.getElementById('whatsNewOverlay').classList.remove('visible');
    
    // Save that they've seen this version
    if (window.currentUser) {
        try {
            await setDoc(doc(db, "users", window.currentUser.uid), {
                lastSeenUpdateVersion: UPDATE_CONFIG.version
            }, { merge: true });
            window.currentUserProfile.lastSeenUpdateVersion = UPDATE_CONFIG.version;
        } catch (error) {
            console.error("Error saving update version:", error);
        }
    }
}
window.dismissWhatsNew = dismissWhatsNew;

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
        case 'discover':
            showDiscoverScreen();
            break;
        case 'messages':
            showConversations();
            break;
        case 'profile':
            showOwnProfile();
            break;
    }
}
window.switchTab = switchTab;

// Show social feed home screen (new home)
function showFeedHome() {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = '';
    });
    const screenFeed = document.getElementById('screenFeed');
    if (screenFeed) {
        screenFeed.classList.add('active');
        screenFeed.style.display = 'block';
    }
    showGlobalHeader();
    document.body.classList.remove('hide-tab-bar');
    const tabBar = document.getElementById('bottomTabBar');
    if (tabBar) tabBar.style.display = 'flex';

    // Clear URL
    window.history.replaceState({}, '', '/');

    // Update user avatar in create post prompt
    updateFeedUserAvatar();

    // Load the social feed
    loadSocialFeed();
}
window.showFeedHome = showFeedHome;

// Show discover screen (musician discovery)
function showDiscoverScreen() {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = '';
    });
    const screenDiscover = document.getElementById('screenDiscover');
    if (screenDiscover) {
        screenDiscover.classList.add('active');
        screenDiscover.style.display = 'block';
    }
    showGlobalHeader();
    document.body.classList.remove('hide-tab-bar');
    const tabBar = document.getElementById('bottomTabBar');
    if (tabBar) tabBar.style.display = 'flex';

    // Load the discovery feed
    loadDiscoveryFeed();
}
window.showDiscoverScreen = showDiscoverScreen;

// Legacy function - redirect to new feed home
function showDiscoveryHome() {
    showFeedHome();
}
window.showDiscoveryHome = showDiscoveryHome;

// Current filter state
window.currentDiscoveryFilter = 'all';

// Load the discovery feed
async function loadDiscoveryFeed(filter) {
    filter = filter || window.currentDiscoveryFilter || 'all';
    
    const feedContent = document.getElementById('feedContent');
    const feedLoading = document.getElementById('feedLoading');
    const feedEmpty = document.getElementById('feedEmpty');
    
    if (!feedContent || !feedLoading || !feedEmpty) {
        console.error("Discovery feed elements not found");
        return;
    }
    
    feedLoading.style.display = 'flex';
    feedEmpty.style.display = 'none';
    feedContent.innerHTML = '';
    
    try {
        // Query discoverable users
        const usersQuery = query(
            collection(db, "users"),
            where("discoverable", "==", true)
        );
        
        console.log("Querying discoverable users...");
        const snapshot = await getDocs(usersQuery);
        console.log("Found", snapshot.size, "discoverable users");
        
        feedLoading.style.display = 'none';
        
        if (snapshot.empty) {
            feedEmpty.style.display = 'block';
            return;
        }
        
        let musicians = [];
        snapshot.forEach(doc => {
            // Don't show current user in feed
            if (window.currentUser && doc.id === window.currentUser.uid) return;
            musicians.push({ id: doc.id, ...doc.data() });
        });
        
        // Apply instrument filter
        if (filter !== 'all' && filter !== 'available') {
            const filterMap = {
                'guitar': ['Guitar', 'Electric Guitar', 'Acoustic Guitar'],
                'bass': ['Bass', 'Electric Bass', 'Upright Bass'],
                'drums': ['Drums', 'Percussion'],
                'keys': ['Keys', 'Keyboard', 'Piano', 'Synth'],
                'vocals': ['Vocals', 'Singer', 'Lead Vocals', 'Backup Vocals']
            };
            
            const matchingInstruments = filterMap[filter] || [filter];
            musicians = musicians.filter(m => {
                const userInstruments = m.instruments || [];
                return userInstruments.some(inst => 
                    matchingInstruments.some(match => 
                        inst.toLowerCase().includes(match.toLowerCase())
                    )
                );
            });
        }
        
        // Apply availability filter
        if (filter === 'available') {
            musicians = musicians.filter(m => m.available === true);
        }
        
        console.log("After filtering:", musicians.length, "musicians");
        
        if (musicians.length === 0) {
            feedEmpty.style.display = 'block';
            // Customize empty message based on filter
            const emptyIcon = feedEmpty.querySelector('.feed-empty-icon');
            const emptyH3 = feedEmpty.querySelector('h3');
            const emptyP = feedEmpty.querySelector('p');
            
            if (filter !== 'all') {
                if (emptyH3) emptyH3.textContent = 'No matches';
                if (emptyP) emptyP.textContent = `No musicians found for "${filter}". Try a different filter.`;
            } else {
                if (emptyH3) emptyH3.textContent = 'No musicians yet';
                if (emptyP) emptyP.textContent = 'Be the first to complete your profile and appear here!';
            }
            return;
        }
        
        // Render musician cards
        musicians.forEach(musician => {
            const card = createMusicianCard(musician);
            feedContent.appendChild(card);
        });
        
    } catch (error) {
        console.error("Error loading discovery feed:", error);
        feedLoading.style.display = 'none';
        feedContent.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">Error loading feed: ' + error.message + '</p>';
    }
}
window.loadDiscoveryFeed = loadDiscoveryFeed;

// Create a musician card for the feed
function createMusicianCard(musician) {
    const card = document.createElement('div');
    card.className = 'musician-card';
    card.onclick = () => viewMusicianProfile(musician.id);
    
    // Get instruments display
    const instruments = musician.instruments || [];
    const instrumentsText = instruments.length > 0 ? instruments.join(' · ') : 'Musician';
    
    // Get location
    const location = musician.location || '';
    
    // Get bio snippet (truncate if too long)
    let bio = musician.bio || '';
    if (bio.length > 200) {
        bio = bio.substring(0, 200) + '...';
    }
    
    // Get genres (if we add this field later)
    const genres = musician.genres || [];
    
    // Avatar - use primary photo from photos array
    let avatarContent = '';
    const photoURL = getPrimaryPhotoURL(musician);
    if (photoURL) {
        avatarContent = `<img src="${photoURL}" alt="${escapeHtml(musician.name)}">`;
    } else {
        avatarContent = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';
    }
    
    card.innerHTML = `
        <div class="musician-card-header">
            <div class="musician-card-avatar">${avatarContent}</div>
            <div class="musician-card-info">
                <div class="musician-card-name-row">
                    <span class="musician-card-name">${escapeHtml(musician.name || 'Anonymous')}</span>
                    ${musician.available ? '<span class="musician-card-available">Available</span>' : ''}
                </div>
                <div class="musician-card-meta">${escapeHtml(instrumentsText)}${location ? ' · ' + escapeHtml(location) : ''}</div>
            </div>
        </div>
        ${bio ? `<p class="musician-card-bio">${escapeHtml(bio)}</p>` : ''}
        ${genres.length > 0 ? `
            <div class="musician-card-genres">
                ${genres.map(g => `<span class="genre-tag">${escapeHtml(g)}</span>`).join('')}
            </div>
        ` : ''}
    `;
    
    return card;
}

// Filter discovery feed
function setDiscoveryFilter(filter) {
    window.currentDiscoveryFilter = filter;
    
    // Update active pill
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.filter === filter);
    });
    
    // Reload with filter
    loadDiscoveryFeed(filter);
}
window.setDiscoveryFilter = setDiscoveryFilter;

// ===== CONNECTIONS SYSTEM =====

// Get connection status between current user and another user
async function getConnectionStatus(otherUserId) {
    if (!window.currentUser) return { status: 'none' };

    const myId = window.currentUser.uid;
    if (myId === otherUserId) return { status: 'self' };

    const targetUsers = [myId, otherUserId].sort();

    // Query using array-contains (which Firestore can verify against security rules)
    // Then filter client-side for the specific connection
    const q = query(
        collection(db, "connections"),
        where("users", "array-contains", myId)
    );
    const snap = await getDocs(q);

    // Find the connection with this specific user
    for (const docSnap of snap.docs) {
        const conn = docSnap.data();
        // Check if this connection is with the target user
        if (conn.users && conn.users.length === 2 &&
            conn.users.includes(myId) && conn.users.includes(otherUserId)) {
            return {
                status: conn.status,
                connectionId: docSnap.id,
                isPending: conn.status === 'pending',
                isSentByMe: conn.requestedBy === myId,
                message: conn.message || null
            };
        }
    }

    return { status: 'none' };
}
window.getConnectionStatus = getConnectionStatus;

// Send a connection request (also creates a DM conversation)
async function sendConnectionRequest(toUserId, message = '') {
    if (!window.currentUser) {
        alert('Please sign in first');
        signInWithGoogleAndCheckProfile();
        return null;
    }

    const myId = window.currentUser.uid;
    if (myId === toUserId) return null;

    try {
        // Check if connection already exists
        const existing = await getConnectionStatus(toUserId);
        if (existing.status !== 'none') {
            console.log('Connection already exists:', existing.status);
            return existing;
        }

        const users = [myId, toUserId].sort();

        // Create connection request
        console.log('Creating connection request...');
        const connectionRef = await addDoc(collection(db, "connections"), {
            users: users,
            requestedBy: myId,
            requestedAt: serverTimestamp(),
            status: 'pending',
            acceptedAt: null,
            message: message || null
        });
        console.log('Connection created:', connectionRef.id);

        // Create or get conversation for the connection request
        const conversationId = getConversationId(myId, toUserId);
        const convRef = doc(db, "conversations", conversationId);

        // Try to check if conversation exists, but handle permission errors
        let convExists = false;
        try {
            const convSnap = await getDoc(convRef);
            convExists = convSnap.exists();
        } catch (e) {
            // Permission denied likely means doc doesn't exist
            console.log('Conversation check failed (probably doesnt exist):', e.message);
            convExists = false;
        }

        console.log('Creating/updating conversation...');
        if (!convExists) {
            await setDoc(convRef, {
                participants: [myId, toUserId].sort(),
                lastMessage: message || "Connection request sent",
                lastMessageAt: serverTimestamp(),
                lastMessageBy: myId,
                createdAt: serverTimestamp(),
                connectionId: connectionRef.id,
                connectionStatus: 'pending'
            });
        } else {
            // Update existing conversation with connection info
            await updateDoc(convRef, {
                connectionId: connectionRef.id,
                connectionStatus: 'pending',
                lastMessage: message || "Connection request sent",
                lastMessageAt: serverTimestamp(),
                lastMessageBy: myId
            });
        }
        console.log('Conversation created/updated');

        // Add the message to the conversation
        if (message) {
            console.log('Adding message to conversation...');
            await addDoc(collection(db, "conversations", conversationId, "messages"), {
                senderId: myId,
                text: message,
                sentAt: serverTimestamp(),
                isConnectionRequest: true
            });
            console.log('Message added');
        }

        // Update button state
        updateConnectButton(toUserId, 'pending', true);

        // Update messages badge
        if (window.updateMessagesBadge) updateMessagesBadge();

        return { status: 'pending', isSentByMe: true };
    } catch (error) {
        console.error('sendConnectionRequest error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        throw error; // Re-throw so caller can handle
    }
}
window.sendConnectionRequest = sendConnectionRequest;

// Accept a connection request
async function acceptConnection(connectionId) {
    if (!window.currentUser) return;

    await updateDoc(doc(db, "connections", connectionId), {
        status: 'accepted',
        acceptedAt: serverTimestamp()
    });

    // Refresh connections list if on that screen
    if (document.getElementById('screenConnections').classList.contains('active')) {
        loadPendingRequests();
        loadMyConnections();
    }

    // Update pending badge count
    updatePendingBadge();
    updateMessagesBadge();
}

// Accept connection from conversation view
async function acceptConnectionFromConv(connectionId, conversationId) {
    if (!window.currentUser) return;

    // Accept the connection
    await updateDoc(doc(db, "connections", connectionId), {
        status: 'accepted',
        acceptedAt: serverTimestamp()
    });

    // Update conversation status (create if doesn't exist)
    const convRef = doc(db, "conversations", conversationId);
    const convSnap = await getDoc(convRef);
    if (convSnap.exists()) {
        await updateDoc(convRef, {
            connectionStatus: 'accepted'
        });
    }

    // Refresh conversations list
    await loadConversations();

    // Update badges
    updatePendingBadge();
    updateMessagesBadge();
}
window.acceptConnectionFromConv = acceptConnectionFromConv;

// Decline connection from conversation view
async function declineConnectionFromConv(connectionId, conversationId) {
    if (!window.currentUser) return;

    // Delete the connection
    await deleteDoc(doc(db, "connections", connectionId));

    // Update conversation to remove connection status (if exists)
    const convRef = doc(db, "conversations", conversationId);
    const convSnap = await getDoc(convRef);
    if (convSnap.exists()) {
        await updateDoc(convRef, {
            connectionStatus: 'declined',
            connectionId: null
        });
    }

    // Refresh conversations list
    await loadConversations();

    // Update badges
    updatePendingBadge();
    updateMessagesBadge();
}
window.declineConnectionFromConv = declineConnectionFromConv;
window.acceptConnection = acceptConnection;

// Decline a connection request
async function declineConnection(connectionId) {
    if (!window.currentUser) return;

    await deleteDoc(doc(db, "connections", connectionId));

    // Refresh connections list if on that screen
    if (document.getElementById('screenConnections').classList.contains('active')) {
        loadPendingRequests();
    }

    // Update pending badge count
    updatePendingBadge();
}
window.declineConnection = declineConnection;

// Remove an existing connection
async function removeConnection(connectionId) {
    if (!window.currentUser) return;

    if (!confirm('Are you sure you want to remove this connection?')) return;

    await deleteDoc(doc(db, "connections", connectionId));

    // Refresh connections list if on that screen
    if (document.getElementById('screenConnections').classList.contains('active')) {
        loadMyConnections();
    }
}
window.removeConnection = removeConnection;

// Cancel a pending request I sent
async function cancelConnectionRequest(connectionId) {
    if (!window.currentUser) return;

    await deleteDoc(doc(db, "connections", connectionId));

    // Update button if on profile
    if (window.viewingMusicianId) {
        updateConnectButton(window.viewingMusicianId, 'none', false);
    }
}
window.cancelConnectionRequest = cancelConnectionRequest;

// Load my accepted connections
async function loadMyConnections() {
    if (!window.currentUser) return [];

    const myId = window.currentUser.uid;
    const connectionsList = document.getElementById('connectionsList');

    if (connectionsList) {
        connectionsList.innerHTML = '<div class="loading-spinner"></div>';
    }

    const q = query(
        collection(db, "connections"),
        where("users", "array-contains", myId),
        where("status", "==", "accepted")
    );

    const snap = await getDocs(q);
    const connections = [];

    for (const docSnap of snap.docs) {
        const conn = docSnap.data();
        const otherUserId = conn.users.find(id => id !== myId);

        // Get the other user's profile
        const userSnap = await getDoc(doc(db, "users", otherUserId));
        if (userSnap.exists()) {
            connections.push({
                connectionId: docSnap.id,
                userId: otherUserId,
                user: userSnap.data(),
                acceptedAt: conn.acceptedAt
            });
        }
    }

    // Render connections
    if (connectionsList) {
        if (connections.length === 0) {
            connectionsList.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.5;">
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/>
                        <circle cx="19" cy="7" r="3"/>
                        <path d="M19 21v-1a3 3 0 00-3-3h-1"/>
                    </svg>
                    <p>No connections yet</p>
                    <p style="font-size: 13px; color: #666;">Connect with musicians you know</p>
                </div>
            `;
        } else {
            connectionsList.innerHTML = connections.map(c => renderConnectionCard(c)).join('');
        }
    }

    return connections;
}
window.loadMyConnections = loadMyConnections;

// Load pending incoming requests
async function loadPendingRequests() {
    if (!window.currentUser) return [];

    const myId = window.currentUser.uid;
    const requestsList = document.getElementById('requestsList');

    if (requestsList) {
        requestsList.innerHTML = '<div class="loading-spinner"></div>';
    }

    const q = query(
        collection(db, "connections"),
        where("users", "array-contains", myId),
        where("status", "==", "pending")
    );

    const snap = await getDocs(q);
    const requests = [];

    for (const docSnap of snap.docs) {
        const conn = docSnap.data();
        // Only show requests where I'm NOT the requester (incoming requests)
        if (conn.requestedBy !== myId) {
            const userSnap = await getDoc(doc(db, "users", conn.requestedBy));
            if (userSnap.exists()) {
                requests.push({
                    connectionId: docSnap.id,
                    userId: conn.requestedBy,
                    user: userSnap.data(),
                    requestedAt: conn.requestedAt,
                    message: conn.message
                });
            }
        }
    }

    // Render requests
    if (requestsList) {
        if (requests.length === 0) {
            requestsList.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.5;">
                        <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                        <circle cx="8.5" cy="7" r="4"/>
                        <line x1="20" y1="8" x2="20" y2="14"/>
                        <line x1="23" y1="11" x2="17" y2="11"/>
                    </svg>
                    <p>No pending requests</p>
                </div>
            `;
        } else {
            requestsList.innerHTML = requests.map(r => renderRequestCard(r)).join('');
        }
    }

    return requests;
}
window.loadPendingRequests = loadPendingRequests;

// Get pending request count
async function getPendingRequestCount() {
    if (!window.currentUser) return 0;

    const myId = window.currentUser.uid;

    const q = query(
        collection(db, "connections"),
        where("users", "array-contains", myId),
        where("status", "==", "pending")
    );

    const snap = await getDocs(q);
    let count = 0;

    snap.docs.forEach(docSnap => {
        const conn = docSnap.data();
        if (conn.requestedBy !== myId) {
            count++;
        }
    });

    return count;
}
window.getPendingRequestCount = getPendingRequestCount;

// Update the pending badge in menu
async function updatePendingBadge() {
    const count = await getPendingRequestCount();
    const badge = document.getElementById('connectionsBadge');

    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}
window.updatePendingBadge = updatePendingBadge;

// Update the requests tab badge
async function updateRequestsTabBadge() {
    const count = await getPendingRequestCount();
    const badge = document.getElementById('requestsTabBadge');

    if (badge) {
        if (count > 0) {
            badge.textContent = count;
        } else {
            badge.textContent = '';
        }
    }
}
window.updateRequestsTabBadge = updateRequestsTabBadge;

// Render a connection card
function renderConnectionCard(connection) {
    const user = connection.user;
    const instruments = user.instruments || [];
    const instrumentsText = instruments.length > 0 ? instruments.join(' · ') : '';
    const photoURL = getPrimaryPhotoURL(user);

    const avatarHtml = photoURL
        ? `<img src="${photoURL}" alt="${escapeHtml(user.name)}">`
        : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';

    const acceptedDate = connection.acceptedAt?.toDate ? connection.acceptedAt.toDate() : new Date();
    const dateStr = acceptedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return `
        <div class="connection-card" onclick="viewMusicianProfile('${connection.userId}')">
            <div class="connection-avatar">${avatarHtml}</div>
            <div class="connection-info">
                <div class="connection-name">${escapeHtml(user.name || 'Unknown')}</div>
                <div class="connection-meta">${escapeHtml(instrumentsText)}${user.location ? (instrumentsText ? ' · ' : '') + escapeHtml(user.location) : ''}</div>
                <div class="connection-date">Connected ${dateStr}</div>
            </div>
            <div class="connection-actions">
                <button class="connection-msg-btn" onclick="event.stopPropagation(); startConversation('${connection.userId}')" title="Message">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                </button>
                <button class="connection-view-btn" onclick="event.stopPropagation(); viewMusicianProfile('${connection.userId}')">View</button>
            </div>
        </div>
    `;
}

// Render a request card
function renderRequestCard(request) {
    const user = request.user;
    const instruments = user.instruments || [];
    const instrumentsText = instruments.length > 0 ? instruments.join(' · ') : '';
    const photoURL = getPrimaryPhotoURL(user);

    const avatarHtml = photoURL
        ? `<img src="${photoURL}" alt="${escapeHtml(user.name)}">`
        : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';

    return `
        <div class="connection-card request-card">
            <div class="connection-avatar">${avatarHtml}</div>
            <div class="connection-info" onclick="viewMusicianProfile('${request.userId}')">
                <div class="connection-name">${escapeHtml(user.name || 'Unknown')}</div>
                <div class="connection-meta">${escapeHtml(instrumentsText)}${user.location ? (instrumentsText ? ' · ' : '') + escapeHtml(user.location) : ''}</div>
                ${request.message ? `<div class="request-message">"${escapeHtml(request.message)}"</div>` : ''}
            </div>
            <div class="request-actions">
                <button class="request-accept-btn" onclick="acceptConnection('${request.connectionId}')">Accept</button>
                <button class="request-decline-btn" onclick="declineConnection('${request.connectionId}')">Decline</button>
            </div>
        </div>
    `;
}

// Show connections screen
async function showConnections(tab = 'connections') {
    if (!window.currentUser) {
        alert('Please sign in first');
        signInWithGoogleAndCheckProfile();
        return;
    }

    // Clear all screens
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = '';
    });
    document.getElementById('screenConnections').classList.add('active');

    window.history.pushState({}, '', '/connections');

    // Update requests tab badge
    updateRequestsTabBadge();

    // Set active tab
    switchConnectionsTab(tab);

    // Load data
    if (tab === 'connections') {
        loadMyConnections();
    } else {
        loadPendingRequests();
    }

    // Close menu if open
    const slideMenu = document.getElementById('slideMenu');
    if (slideMenu.classList.contains('open')) {
        toggleMenu();
    }
}
window.showConnections = showConnections;

// Switch between connections tabs
function switchConnectionsTab(tab) {
    const connectionsTab = document.getElementById('connectionsTabBtn');
    const requestsTab = document.getElementById('requestsTabBtn');
    const connectionsList = document.getElementById('connectionsList');
    const requestsList = document.getElementById('requestsList');

    if (tab === 'connections') {
        connectionsTab.classList.add('active');
        requestsTab.classList.remove('active');
        connectionsList.style.display = 'block';
        requestsList.style.display = 'none';
        loadMyConnections();
    } else {
        connectionsTab.classList.remove('active');
        requestsTab.classList.add('active');
        connectionsList.style.display = 'none';
        requestsList.style.display = 'block';
        loadPendingRequests();
    }
}
window.switchConnectionsTab = switchConnectionsTab;

// Update connect button state on profile
function updateConnectButton(userId, status, isSentByMe, connectionId = null) {
    const btn = document.getElementById('connectMusicianBtn');
    if (!btn) return;

    btn.className = 'connect-btn';
    btn.disabled = false;

    switch (status) {
        case 'none':
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>Connect';
            btn.onclick = () => promptConnectionMessage(userId);
            break;
        case 'pending':
            if (isSentByMe) {
                btn.classList.add('pending');
                btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>Pending';
                btn.onclick = () => {
                    if (confirm('Cancel connection request?')) {
                        cancelConnectionRequest(connectionId);
                    }
                };
            } else {
                btn.classList.add('respond');
                btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>Respond';
                btn.onclick = () => showConnectionResponse(connectionId, userId);
            }
            break;
        case 'accepted':
            btn.classList.add('connected');
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>Connected';
            btn.onclick = () => {
                if (confirm('Remove connection?')) {
                    removeConnection(connectionId);
                    updateConnectButton(userId, 'none', false);
                }
            };
            break;
        case 'self':
            btn.style.display = 'none';
            break;
    }
}

// Show connection response options (for incoming requests viewed on profile)
function showConnectionResponse(connectionId, userId) {
    const action = confirm('Accept this connection request?\n\nPress OK to Accept, Cancel to Decline');
    if (action) {
        acceptConnection(connectionId);
        updateConnectButton(userId, 'accepted', false, connectionId);
    } else {
        if (confirm('Decline this connection request?')) {
            declineConnection(connectionId);
            updateConnectButton(userId, 'none', false);
        }
    }
}

// Open chat to send connection request with message
function promptConnectionMessage(userId) {
    if (!window.currentUser) {
        alert('Please sign in to connect with musicians');
        signInWithGoogleAndCheckProfile();
        return;
    }
    // Open chat in "connection request" mode
    showChatForConnectionRequest(userId);
}
window.promptConnectionMessage = promptConnectionMessage;

// ===== END CONNECTIONS SYSTEM =====

// ===== DIRECT MESSAGES SYSTEM =====

// Current conversation state
window.currentConversationId = null;
window.currentChatUserId = null;
let messageUnsubscribe = null;

// Generate deterministic conversation ID from two user IDs
function getConversationId(userId1, userId2) {
    return [userId1, userId2].sort().join('_');
}
window.getConversationId = getConversationId;

// Get or create a conversation with another user
async function getOrCreateConversation(otherUserId) {
    if (!window.currentUser) return null;

    const myId = window.currentUser.uid;
    const conversationId = getConversationId(myId, otherUserId);

    const convRef = doc(db, "conversations", conversationId);
    const convSnap = await getDoc(convRef);

    if (!convSnap.exists()) {
        await setDoc(convRef, {
            participants: [myId, otherUserId].sort(),
            lastMessage: null,
            lastMessageAt: null,
            lastMessageBy: null,
            createdAt: serverTimestamp()
        });
    }

    return conversationId;
}
window.getOrCreateConversation = getOrCreateConversation;

// Start a conversation with a user (from profile)
async function startConversation(otherUserId) {
    if (!window.currentUser) {
        alert('Please sign in first');
        signInWithGoogleAndCheckProfile();
        return;
    }

    const conversationId = await getOrCreateConversation(otherUserId);
    if (conversationId) {
        showChat(conversationId, otherUserId);
    }
}
window.startConversation = startConversation;

// Load all conversations for current user (including pending connection requests)
async function loadConversations() {
    if (!window.currentUser) return [];

    const myId = window.currentUser.uid;
    const container = document.getElementById('conversationsList');
    const emptyState = document.getElementById('conversationsEmpty');

    container.innerHTML = '<div class="loading-spinner"></div>';
    emptyState.style.display = 'none';

    try {
        // Load conversations
        const convQuery = query(
            collection(db, "conversations"),
            where("participants", "array-contains", myId)
        );
        const convSnap = await getDocs(convQuery);

        // Also load pending connection requests TO me (that might not have conversations)
        const connQuery = query(
            collection(db, "connections"),
            where("users", "array-contains", myId),
            where("status", "==", "pending")
        );
        const connSnap = await getDocs(connQuery);

        // Track which connections already have conversations
        const conversationConnIds = new Set();

        // Get all conversations with user data
        const conversations = [];
        for (const docSnap of convSnap.docs) {
            const conv = { id: docSnap.id, ...docSnap.data() };
            if (conv.connectionId) {
                conversationConnIds.add(conv.connectionId);
            }
            // Get the other user's ID
            const otherUserId = conv.participants.find(p => p !== myId);
            if (otherUserId) {
                // Fetch their profile
                const userRef = doc(db, "users", otherUserId);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    conv.otherUser = { id: otherUserId, ...userSnap.data() };
                    conversations.push(conv);
                }
            }
        }

        // Add pending connection requests that don't have conversations
        for (const docSnap of connSnap.docs) {
            if (conversationConnIds.has(docSnap.id)) continue; // Already has conversation

            const conn = docSnap.data();
            // Only show requests TO me (not FROM me)
            if (conn.requestedBy === myId) continue;

            const otherUserId = conn.users.find(u => u !== myId);
            if (otherUserId) {
                const userRef = doc(db, "users", otherUserId);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    // Create a pseudo-conversation for display
                    conversations.push({
                        id: getConversationId(myId, otherUserId),
                        participants: conn.users,
                        connectionId: docSnap.id,
                        connectionStatus: 'pending',
                        lastMessage: conn.message || 'Wants to connect',
                        lastMessageAt: conn.requestedAt,
                        lastMessageBy: conn.requestedBy,
                        otherUser: { id: otherUserId, ...userSnap.data() },
                        isPseudoConversation: true
                    });
                }
            }
        }

        // Sort by lastMessageAt (most recent first)
        conversations.sort((a, b) => {
            const aTime = a.lastMessageAt?.toDate?.() || new Date(0);
            const bTime = b.lastMessageAt?.toDate?.() || new Date(0);
            return bTime - aTime;
        });

        // Render conversations
        if (conversations.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'flex';
        } else {
            emptyState.style.display = 'none';
            container.innerHTML = conversations.map(conv => renderConversationCard(conv)).join('');
        }

        return conversations;
    } catch (error) {
        console.error("Error loading conversations:", error);
        container.innerHTML = '<div class="empty-state"><p>Error loading messages</p></div>';
        return [];
    }
}
window.loadConversations = loadConversations;

// Render a conversation card for the inbox
function renderConversationCard(conv) {
    const user = conv.otherUser;
    const photoURL = getPrimaryPhotoURL(user);
    const avatarHtml = photoURL
        ? `<img src="${photoURL}" alt="${escapeHtml(user.name || 'User')}">`
        : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';

    const lastMessageTime = conv.lastMessageAt?.toDate?.();
    const timeStr = lastMessageTime ? formatMessageTime(lastMessageTime) : '';

    // Check if this conversation has unread messages
    const isUnread = conv.lastMessageBy && conv.lastMessageBy !== window.currentUser.uid;

    const preview = conv.lastMessage
        ? escapeHtml(conv.lastMessage.substring(0, 40)) + (conv.lastMessage.length > 40 ? '...' : '')
        : 'No messages yet';

    // Check if this is a pending connection request TO me
    const isPendingRequest = conv.connectionStatus === 'pending' && conv.lastMessageBy !== window.currentUser.uid;
    const isPendingSent = conv.connectionStatus === 'pending' && conv.lastMessageBy === window.currentUser.uid;

    let statusHtml = '';
    if (isPendingRequest && conv.connectionId) {
        statusHtml = `
            <div class="conversation-request-actions">
                <button class="conv-accept-btn" onclick="event.stopPropagation(); acceptConnectionFromConv('${conv.connectionId}', '${conv.id}')">Accept</button>
                <button class="conv-decline-btn" onclick="event.stopPropagation(); declineConnectionFromConv('${conv.connectionId}', '${conv.id}')">Decline</button>
            </div>
        `;
    } else if (isPendingSent) {
        statusHtml = `<div class="conversation-pending-label">Request pending</div>`;
    }

    return `
        <div class="conversation-card ${isUnread ? 'unread' : ''} ${isPendingRequest ? 'has-request' : ''}" onclick="showChat('${conv.id}', '${user.id}')">
            <div class="conversation-avatar">${avatarHtml}</div>
            <div class="conversation-content">
                <div class="conversation-header">
                    <span class="conversation-name">${escapeHtml(user.name || 'Unknown')}</span>
                    <span class="conversation-time">${timeStr}</span>
                </div>
                <div class="conversation-preview">
                    <span class="conversation-preview-text">${isPendingRequest ? 'Wants to connect' : preview}</span>
                    ${isUnread && !isPendingRequest ? '<span class="unread-indicator"></span>' : ''}
                </div>
                ${statusHtml}
            </div>
        </div>
    `;
}

// Format message time for display
function formatMessageTime(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Show conversations/inbox screen
async function showConversations() {
    if (!window.currentUser) {
        alert('Please sign in first');
        signInWithGoogleAndCheckProfile();
        return;
    }

    // Unsubscribe from any active chat listener
    unsubscribeFromMessages();

    // Clear conversation state
    window.currentConversationId = null;
    window.currentChatUserId = null;

    // Restore global header and tab bar (in case coming from chat)
    document.getElementById('globalHeader').style.display = '';
    document.body.classList.remove('hide-tab-bar');
    showTabBar();

    // Update tab bar
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const tabMessages = document.getElementById('tabMessages');
    if (tabMessages) tabMessages.classList.add('active');

    // Clear all screens
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = '';
    });
    document.getElementById('screenConversations').classList.add('active');

    window.history.pushState({}, '', '/messages');

    // Close menu if open
    const overlay = document.getElementById('menuOverlay');
    const menu = document.getElementById('slideMenu');
    overlay.classList.remove('visible');
    menu.classList.remove('visible');

    // Load conversations
    await loadConversations();
}
window.showConversations = showConversations;

// Show individual chat screen
async function showChat(conversationId, otherUserId) {
    if (!window.currentUser) {
        alert('Please sign in first');
        signInWithGoogleAndCheckProfile();
        return;
    }

    window.currentConversationId = conversationId;
    window.currentChatUserId = otherUserId;
    window.isConnectionRequestMode = false; // Reset connection request mode

    // Reset input placeholder
    const input = document.getElementById('messageInput');
    if (input) input.placeholder = 'Type a message...';

    // Clear all screens
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = '';
    });
    document.getElementById('screenChat').classList.add('active');

    window.history.pushState({}, '', '/chat/' + conversationId);

    // Hide global header and tab bar for chat
    document.getElementById('globalHeader').style.display = 'none';
    document.body.classList.add('hide-tab-bar');

    // Load other user's info for header
    try {
        const userRef = doc(db, "users", otherUserId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const user = userSnap.data();
            document.getElementById('chatUserName').textContent = user.name || 'Unknown';
            const photoURL = getPrimaryPhotoURL(user);
            document.getElementById('chatUserAvatar').innerHTML = photoURL
                ? `<img src="${photoURL}" alt="${escapeHtml(user.name || 'User')}">`
                : '';
        }
    } catch (error) {
        console.error("Error loading chat user:", error);
    }

    // Clear messages and start listening
    document.getElementById('messagesList').innerHTML = '<div class="messages-loading"><div class="loading-spinner"></div></div>';

    // Subscribe to messages
    subscribeToMessages(conversationId);

    // Focus input
    setTimeout(() => {
        document.getElementById('messageInput').focus();
    }, 100);
}
window.showChat = showChat;

// Show chat in connection request mode (when clicking Connect on a profile)
async function showChatForConnectionRequest(otherUserId) {
    if (!window.currentUser) {
        alert('Please sign in first');
        signInWithGoogleAndCheckProfile();
        return;
    }

    const myId = window.currentUser.uid;
    const conversationId = getConversationId(myId, otherUserId);

    window.currentConversationId = conversationId;
    window.currentChatUserId = otherUserId;
    window.isConnectionRequestMode = true; // Flag for connection request mode

    // Clear all screens
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = '';
    });
    document.getElementById('screenChat').classList.add('active');

    window.history.pushState({}, '', '/chat/' + conversationId);

    // Hide global header and tab bar for chat
    document.getElementById('globalHeader').style.display = 'none';
    document.body.classList.add('hide-tab-bar');

    // Load other user's info for header
    let userName = 'this musician';
    try {
        const userRef = doc(db, "users", otherUserId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const user = userSnap.data();
            userName = user.name || 'Unknown';
            document.getElementById('chatUserName').textContent = userName;
            const photoURL = getPrimaryPhotoURL(user);
            document.getElementById('chatUserAvatar').innerHTML = photoURL
                ? `<img src="${photoURL}" alt="${escapeHtml(user.name || 'User')}">`
                : '';
        }
    } catch (error) {
        console.error("Error loading chat user:", error);
    }

    // Show connection request banner instead of messages
    document.getElementById('messagesList').innerHTML = `
        <div class="connection-request-banner">
            <div class="connection-banner-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                    <circle cx="8.5" cy="7" r="4"/>
                    <line x1="20" y1="8" x2="20" y2="14"/>
                    <line x1="23" y1="11" x2="17" y2="11"/>
                </svg>
            </div>
            <h3>Connect with ${escapeHtml(userName)}</h3>
            <p>Send a message to introduce yourself and request to connect.</p>
            <button class="connect-without-msg-btn" onclick="sendConnectionWithoutMessage()">
                Connect without message
            </button>
        </div>
    `;

    // Update input placeholder
    document.getElementById('messageInput').placeholder = 'Write a message to connect...';

    // Focus input
    setTimeout(() => {
        document.getElementById('messageInput').focus();
    }, 100);
}
window.showChatForConnectionRequest = showChatForConnectionRequest;

// Send connection request without a message
async function sendConnectionWithoutMessage() {
    if (!window.currentChatUserId) return;

    await sendConnectionRequest(window.currentChatUserId, '');
    window.isConnectionRequestMode = false;

    // Go back to the profile or show success
    showConversations();
}
window.sendConnectionWithoutMessage = sendConnectionWithoutMessage;

// View chat user's profile
function viewChatUserProfile() {
    if (window.currentChatUserId) {
        viewMusicianProfile(window.currentChatUserId);
    }
}
window.viewChatUserProfile = viewChatUserProfile;

// Subscribe to real-time messages
function subscribeToMessages(conversationId) {
    // Unsubscribe from any existing listener
    unsubscribeFromMessages();

    const messagesRef = collection(db, "conversations", conversationId, "messages");
    const q = query(messagesRef, orderBy("sentAt", "asc"));

    messageUnsubscribe = onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderMessages(messages);
        scrollToBottom();
    }, (error) => {
        console.error("Error listening to messages:", error);
        document.getElementById('messagesList').innerHTML = '<div class="messages-empty"><p>Error loading messages</p></div>';
    });
}

// Unsubscribe from messages listener
function unsubscribeFromMessages() {
    if (messageUnsubscribe) {
        messageUnsubscribe();
        messageUnsubscribe = null;
    }
}
window.unsubscribeFromMessages = unsubscribeFromMessages;

// Render messages in the chat
function renderMessages(messages) {
    const container = document.getElementById('messagesList');
    const myId = window.currentUser?.uid;

    if (messages.length === 0) {
        container.innerHTML = `
            <div class="messages-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
                <p>No messages yet</p>
                <p style="font-size: 13px; margin-top: 4px;">Send a message to start the conversation</p>
            </div>
        `;
        return;
    }

    let lastDate = null;
    let html = '';

    messages.forEach(msg => {
        const isMe = msg.senderId === myId;
        const sentAt = msg.sentAt?.toDate?.();
        const wasEdited = msg.editedAt != null;

        // Add date separator if needed
        if (sentAt) {
            const dateStr = sentAt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            if (dateStr !== lastDate) {
                html += `<div class="message-date-separator"><span>${dateStr}</span></div>`;
                lastDate = dateStr;
            }
        }

        const timeStr = sentAt ? sentAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
        const editedIndicator = wasEdited ? '<span class="message-edited">(edited)</span>' : '';
        const escapedText = escapeHtml(msg.text).replace(/'/g, '&#39;');

        html += `
            <div class="message-wrapper ${isMe ? 'sent' : 'received'}">
                <div class="message-bubble clickable ${isMe ? 'sent' : 'received'}" onclick="showMessageMenu('${msg.id}', '${escapedText}', ${isMe})">
                    ${escapeHtml(msg.text)}
                    <div class="message-time">${timeStr}${editedIndicator}</div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Scroll to bottom of messages
function scrollToBottom() {
    const container = document.getElementById('messagesList');
    if (container) {
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 50);
    }
}

// Send a message (or connection request if in that mode)
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();

    if (!text || !window.currentConversationId || !window.currentUser) return;

    const myId = window.currentUser.uid;
    const conversationId = window.currentConversationId;

    // Clear input immediately for responsiveness
    input.value = '';

    // If in connection request mode, send connection request with message
    if (window.isConnectionRequestMode && window.currentChatUserId) {
        window.isConnectionRequestMode = false;
        input.placeholder = 'Type a message...'; // Reset placeholder

        try {
            const result = await sendConnectionRequest(window.currentChatUserId, text);
            if (result) {
                // Now show the actual chat with messages
                showChat(conversationId, window.currentChatUserId);
            }
        } catch (error) {
            console.error("Error sending connection request:", error);
            console.error("Error details:", error.code, error.message);
            alert("Failed to send connection request. Please try again.");
            input.value = text;
            window.isConnectionRequestMode = true; // Restore mode
        }
        return;
    }

    input.focus();

    try {
        // Add message to subcollection
        await addDoc(collection(db, "conversations", conversationId, "messages"), {
            senderId: myId,
            text: text,
            sentAt: serverTimestamp()
        });

        // Update conversation metadata
        await updateDoc(doc(db, "conversations", conversationId), {
            lastMessage: text,
            lastMessageAt: serverTimestamp(),
            lastMessageBy: myId
        });
    } catch (error) {
        console.error("Error sending message:", error);
        alert("Failed to send message. Please try again.");
        input.value = text; // Restore the message
    }
}
window.sendMessage = sendMessage;

// Handle Enter key in message input
function handleMessageKeypress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}
window.handleMessageKeypress = handleMessageKeypress;

// Update messages badge in menu and tab bar
async function updateMessagesBadge() {
    const menuBadge = document.getElementById('messagesBadge');
    const tabBadge = document.getElementById('messagesTabBadge');

    if (!window.currentUser) {
        if (menuBadge) menuBadge.style.display = 'none';
        if (tabBadge) tabBadge.style.display = 'none';
        return 0;
    }

    try {
        const myId = window.currentUser.uid;

        // Count unread messages
        const convQuery = query(
            collection(db, "conversations"),
            where("participants", "array-contains", myId)
        );
        const convSnap = await getDocs(convQuery);

        let unreadCount = 0;
        convSnap.forEach(docSnap => {
            const conv = docSnap.data();
            // Count as unread if last message was from someone else
            if (conv.lastMessageBy && conv.lastMessageBy !== myId && conv.lastMessage) {
                unreadCount++;
            }
        });

        // Also count pending connection requests (they appear in messages)
        const pendingCount = await getPendingRequestCount();
        const totalCount = unreadCount + pendingCount;

        // Update menu badge
        if (menuBadge) {
            if (totalCount > 0) {
                menuBadge.textContent = totalCount;
                menuBadge.style.display = 'flex';
            } else {
                menuBadge.style.display = 'none';
            }
        }

        // Update tab badge
        if (tabBadge) {
            if (totalCount > 0) {
                tabBadge.textContent = totalCount;
                tabBadge.style.display = 'flex';
            } else {
                tabBadge.style.display = 'none';
            }
        }

        return totalCount;
    } catch (error) {
        console.error("Error counting unread messages:", error);
        return 0;
    }
}
window.updateMessagesBadge = updateMessagesBadge;

// ===== EMOJI PICKER =====

const EMOJI_LIST = [
    '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊',
    '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘',
    '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝',
    '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐',
    '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌',
    '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢',
    '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠',
    '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️',
    '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨',
    '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞',
    '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬',
    '👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️',
    '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆',
    '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '👏',
    '🙌', '👐', '🤲', '🤝', '🙏', '❤️', '🧡', '💛',
    '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️',
    '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟',
    '🎵', '🎶', '🎸', '🎹', '🥁', '🎷', '🎺', '🎻',
    '🎤', '🎧', '🔥', '✨', '🌟', '💫', '⚡', '🎉',
    '🎊', '🙈', '🙉', '🙊', '💀', '👻', '🎃', '🤖'
];

function initEmojiPicker() {
    const grid = document.getElementById('emojiGrid');
    if (!grid) return;

    grid.innerHTML = EMOJI_LIST.map(emoji =>
        `<button onclick="insertEmoji('${emoji}')">${emoji}</button>`
    ).join('');
}

function toggleEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    if (picker.style.display === 'none') {
        picker.style.display = 'block';
        initEmojiPicker();
    } else {
        picker.style.display = 'none';
    }
}
window.toggleEmojiPicker = toggleEmojiPicker;

function insertEmoji(emoji) {
    const input = document.getElementById('messageInput');
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;
    input.value = text.substring(0, start) + emoji + text.substring(end);
    input.selectionStart = input.selectionEnd = start + emoji.length;
    input.focus();
}
window.insertEmoji = insertEmoji;

// ===== MESSAGE ACTIONS =====

window.selectedMessageId = null;
window.selectedMessageText = null;
window.selectedMessageIsMe = false;

function showMessageMenu(messageId, text, isMe) {
    window.selectedMessageId = messageId;
    window.selectedMessageText = text;
    window.selectedMessageIsMe = isMe;

    const menu = document.getElementById('messageActionMenu');
    const overlay = document.getElementById('messageActionOverlay');
    const editBtn = document.getElementById('editMsgBtn');
    const deleteBtn = document.getElementById('deleteMsgBtn');

    // Only show edit/delete for own messages
    if (editBtn) editBtn.style.display = isMe ? 'flex' : 'none';
    if (deleteBtn) deleteBtn.style.display = isMe ? 'flex' : 'none';

    menu.style.display = 'block';
    overlay.classList.add('visible');
}
window.showMessageMenu = showMessageMenu;

function closeMessageMenu() {
    const menu = document.getElementById('messageActionMenu');
    const overlay = document.getElementById('messageActionOverlay');
    menu.style.display = 'none';
    overlay.classList.remove('visible');
    window.selectedMessageId = null;
}
window.closeMessageMenu = closeMessageMenu;

function copyMessage() {
    if (window.selectedMessageText) {
        navigator.clipboard.writeText(window.selectedMessageText).then(() => {
            closeMessageMenu();
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }
}
window.copyMessage = copyMessage;

async function editMessage() {
    if (!window.selectedMessageId || !window.currentConversationId) {
        closeMessageMenu();
        return;
    }

    const newText = prompt('Edit message:', window.selectedMessageText);
    if (newText !== null && newText.trim() !== '' && newText !== window.selectedMessageText) {
        try {
            await updateDoc(
                doc(db, "conversations", window.currentConversationId, "messages", window.selectedMessageId),
                {
                    text: newText.trim(),
                    editedAt: serverTimestamp()
                }
            );
        } catch (error) {
            console.error('Error editing message:', error);
            alert('Failed to edit message');
        }
    }
    closeMessageMenu();
}
window.editMessage = editMessage;

async function deleteMessage() {
    if (!window.selectedMessageId || !window.currentConversationId) {
        closeMessageMenu();
        return;
    }

    if (confirm('Delete this message?')) {
        try {
            await deleteDoc(
                doc(db, "conversations", window.currentConversationId, "messages", window.selectedMessageId)
            );
        } catch (error) {
            console.error('Error deleting message:', error);
            alert('Failed to delete message');
        }
    }
    closeMessageMenu();
}
window.deleteMessage = deleteMessage;

// ===== END DIRECT MESSAGES SYSTEM =====

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

// Initialize social feed on page load if on home screen
document.addEventListener('DOMContentLoaded', function() {
    // Only load social feed if we're at root path and screenFeed is active
    const path = window.location.pathname;
    const screenFeed = document.getElementById('screenFeed');

    if (screenFeed && screenFeed.classList.contains('active') && (path === '/' || path === '')) {
        console.log("Initializing social feed on page load...");
        setTimeout(() => {
            loadSocialFeed();
        }, 100);
    }
});

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
window.currentRehearsalSetlist = [];
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
    window.currentRehearsalSetlist = [];

    // Reset form fields
    document.getElementById('rehearsalName').value = '';
    document.getElementById('rehearsalDate').value = '';
    document.getElementById('rehearsalStartTime').value = '';
    document.getElementById('rehearsalEndTime').value = '';
    document.getElementById('rehearsalLocation').value = '';
    document.getElementById('rehearsalNotes').value = '';
    document.getElementById('rehearsalRecurring').checked = false;
    document.getElementById('recurringOptions').style.display = 'none';

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

// Toggle recurring options
function toggleRecurring() {
    const isRecurring = document.getElementById('rehearsalRecurring').checked;
    document.getElementById('recurringOptions').style.display = isRecurring ? 'block' : 'none';
}
window.toggleRecurring = toggleRecurring;

// Add song to setlist
function addRehearsalSong() {
    const titleInput = document.getElementById('songTitle');
    const durationInput = document.getElementById('songDuration');

    const title = titleInput.value.trim();
    const duration = durationInput.value.trim();

    if (!title) {
        alert('Please enter a song title');
        return;
    }

    window.currentRehearsalSetlist.push({ title, duration, files: [] });
    titleInput.value = '';
    durationInput.value = '';
    renderRehearsalSetlist();
}
window.addRehearsalSong = addRehearsalSong;

// Remove song from setlist
function removeRehearsalSong(index) {
    window.currentRehearsalSetlist.splice(index, 1);
    renderRehearsalSetlist();
}
window.removeRehearsalSong = removeRehearsalSong;

// Render setlist
function renderRehearsalSetlist() {
    const container = document.getElementById('rehearsalSetlistPreview');
    if (!container) return;

    if (window.currentRehearsalSetlist.length === 0) {
        container.innerHTML = '<p style="color: #888; font-size: 14px;">No songs added yet</p>';
        return;
    }

    container.innerHTML = window.currentRehearsalSetlist.map((song, index) => `
        <div class="setlist-song">
            <div class="setlist-song-number">${index + 1}</div>
            <div class="setlist-song-info">
                <div class="setlist-song-title">${song.title}</div>
                ${song.duration ? `<div class="setlist-song-duration">${song.duration}</div>` : ''}
            </div>
            <button class="invitee-remove" onclick="removeRehearsalSong(${index})">
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
    const isRecurring = document.getElementById('rehearsalRecurring').checked;

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
        setlist: window.currentRehearsalSetlist,
        playlist: [],
        files: [],
        isRecurring,
        parentRehearsalId: null,
        createdAt: serverTimestamp()
    };

    try {
        // Add to Firestore
        const docRef = await addDoc(collection(db, "rehearsals"), rehearsalData);

        // Handle recurring rehearsals
        if (isRecurring) {
            const frequency = document.getElementById('rehearsalFrequency').value;
            const endDateStr = document.getElementById('rehearsalRecurringEnd').value;
            if (endDateStr) {
                const startDate = new Date(date + 'T00:00:00');
                const endDate = new Date(endDateStr + 'T00:00:00');
                const dayIncrement = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : 30;
                const count = Math.floor((endDate - startDate) / (dayIncrement * 24 * 60 * 60 * 1000)) + 1;
                await createRecurringRehearsals(docRef.id, rehearsalData, frequency, Math.max(count, 1));
            }
        }

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

// Create recurring rehearsal instances
async function createRecurringRehearsals(parentId, baseData, frequency, count) {
    const startDate = new Date(baseData.date + 'T00:00:00');
    const dayIncrement = frequency === 'weekly' ? 7 : 14;

    for (let i = 1; i < count; i++) {
        const newDate = new Date(startDate);
        newDate.setDate(newDate.getDate() + (dayIncrement * i));

        const recurringData = {
            ...baseData,
            date: newDate.toISOString().split('T')[0],
            parentRehearsalId: parentId,
            isRecurring: false,
            createdAt: serverTimestamp()
        };

        // Reset RSVP statuses for new instance
        recurringData.invitedMembers = recurringData.invitedMembers.map(m => ({
            ...m,
            status: 'pending'
        }));

        await addDoc(collection(db, "rehearsals"), recurringData);
    }
}

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

        // Setlist
        const setlistEl = document.getElementById('rehearsalDetailSetlist');
        if (rehearsal.setlist && rehearsal.setlist.length > 0) {
            let setlistHtml = '<h4>Setlist</h4><div class="setlist-display">';
            rehearsal.setlist.forEach((song, index) => {
                setlistHtml += `
                    <div class="setlist-song">
                        <div class="setlist-song-number">${index + 1}</div>
                        <div class="setlist-song-info">
                            <div class="setlist-song-title">${song.title}</div>
                            ${song.duration ? `<div class="setlist-song-duration">${song.duration}</div>` : ''}
                        </div>
                    </div>
                `;
            });
            setlistHtml += '</div>';
            setlistEl.innerHTML = setlistHtml;
            setlistEl.style.display = 'block';
        } else {
            setlistEl.style.display = 'none';
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
// SOCIAL FEED FUNCTIONS
// ============================================

// Show own profile (Me tab)
function showOwnProfile() {
    if (window.currentUser) {
        viewMusicianProfile(window.currentUser.uid);
    } else {
        // Show sign in prompt or redirect to sign in
        alert('Please sign in to view your profile');
    }
}
window.showOwnProfile = showOwnProfile;

// Update user avatar in feed
function updateFeedUserAvatar() {
    const avatar = document.getElementById('feedUserAvatar');
    const createAvatar = document.getElementById('createPostAvatar');
    const authorName = document.getElementById('createPostAuthorName');

    if (window.currentUserProfile) {
        const photoURL = window.currentUserProfile.profilePhotos?.[0] || '';
        if (avatar) {
            avatar.style.backgroundImage = photoURL ? `url('${photoURL}')` : '';
            avatar.style.backgroundColor = photoURL ? 'transparent' : '#333';
        }
        if (createAvatar) {
            createAvatar.style.backgroundImage = photoURL ? `url('${photoURL}')` : '';
            createAvatar.style.backgroundColor = photoURL ? 'transparent' : '#333';
        }
        if (authorName) {
            authorName.textContent = window.currentUserProfile.name || 'Anonymous';
        }
    }
}

// Load social feed
async function loadSocialFeed() {
    const feedContent = document.getElementById('socialFeedContent');
    const feedLoading = document.getElementById('socialFeedLoading');
    const feedEmpty = document.getElementById('socialFeedEmpty');
    const createPrompt = document.querySelector('.create-post-prompt');
    const signInPrompt = document.getElementById('signInPromptFeed');

    if (!feedContent || !feedLoading || !feedEmpty) {
        console.error("Social feed elements not found");
        return;
    }

    // Show/hide create prompt based on auth state
    if (createPrompt) {
        createPrompt.style.display = window.currentUser ? 'flex' : 'none';
    }
    if (signInPrompt) {
        signInPrompt.style.display = window.currentUser ? 'none' : 'block';
    }

    feedLoading.style.display = 'flex';
    feedEmpty.style.display = 'none';
    feedContent.innerHTML = '';

    try {
        // Query posts ordered by creation date
        const postsQuery = query(
            collection(db, "posts"),
            orderBy("createdAt", "desc"),
            firestoreLimit(50)
        );

        const snapshot = await getDocs(postsQuery);

        feedLoading.style.display = 'none';

        if (snapshot.empty) {
            feedEmpty.style.display = 'block';
            return;
        }

        let postsHtml = '';
        snapshot.forEach(docSnap => {
            const post = { id: docSnap.id, ...docSnap.data() };
            postsHtml += renderPostCard(post);
        });

        feedContent.innerHTML = postsHtml;

    } catch (error) {
        console.error("Error loading social feed:", error);
        feedLoading.style.display = 'none';
        feedContent.innerHTML = '<div class="feed-error">Error loading feed. Please try again.</div>';
    }
}
window.loadSocialFeed = loadSocialFeed;

// Format time ago
function formatTimeAgo(date) {
    if (!date) return '';
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Render a post card
function renderPostCard(post) {
    const isOwner = window.currentUser?.uid === post.authorId;
    const timeAgo = formatTimeAgo(post.createdAt?.toDate ? post.createdAt.toDate() : post.createdAt);
    const instruments = post.authorInstruments?.join(', ') || '';
    const meta = instruments ? `${instruments} · ${timeAgo}` : timeAgo;

    let imageHtml = '';
    if (post.imageUrl) {
        imageHtml = `<div class="post-image"><img src="${post.imageUrl}" alt="Post image" onclick="event.stopPropagation(); viewSingleImage('${post.imageUrl}')"></div>`;
    }

    let linkPreviewHtml = '';
    if (post.linkPreview && post.linkUrl) {
        linkPreviewHtml = `
            <a href="${escapeHtml(post.linkUrl)}" target="_blank" rel="noopener" class="post-link-preview" onclick="event.stopPropagation();">
                ${post.linkPreview.image ? `<img class="post-link-image" src="${escapeHtml(post.linkPreview.image)}" alt="">` : ''}
                <div class="post-link-info">
                    <div class="post-link-title">${escapeHtml(post.linkPreview.title || post.linkUrl)}</div>
                    ${post.linkPreview.description ? `<div class="post-link-description">${escapeHtml(post.linkPreview.description)}</div>` : ''}
                    <div class="post-link-url">${escapeHtml(new URL(post.linkUrl).hostname)}</div>
                </div>
            </a>
        `;
    }

    const menuHtml = isOwner ? `
        <button class="post-menu-btn" onclick="event.stopPropagation(); showPostMenu('${post.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
            </svg>
        </button>
    ` : '';

    return `
        <div class="post-card" onclick="showPostDetail('${post.id}')">
            <div class="post-author">
                <div class="post-author-photo" style="background-image: url('${post.authorPhoto || ''}'); ${!post.authorPhoto ? 'background-color: #333;' : ''}" onclick="event.stopPropagation(); viewMusicianProfile('${post.authorId}')"></div>
                <div class="post-author-info">
                    <span class="post-author-name" onclick="event.stopPropagation(); viewMusicianProfile('${post.authorId}')">${escapeHtml(post.authorName || 'Anonymous')}</span>
                    <span class="post-author-meta">${escapeHtml(meta)}</span>
                </div>
                ${menuHtml}
            </div>
            <div class="post-content">${escapeHtml(post.content || '')}</div>
            ${imageHtml}
            ${linkPreviewHtml}
            <div class="post-stats">
                <span class="post-comment-count">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                    ${post.commentCount || 0}
                </span>
            </div>
        </div>
    `;
}

// Show post menu (for deletion)
function showPostMenu(postId) {
    const confirmed = confirm('Delete this post?');
    if (confirmed) {
        deletePost(postId);
    }
}
window.showPostMenu = showPostMenu;

// Delete a post
async function deletePost(postId) {
    if (!window.currentUser) return;

    try {
        // First verify ownership
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);

        if (!postSnap.exists()) {
            alert('Post not found');
            return;
        }

        if (postSnap.data().authorId !== window.currentUser.uid) {
            alert('You can only delete your own posts');
            return;
        }

        // Delete the post
        await deleteDoc(postRef);

        // Refresh feed or remove from DOM
        const postElement = document.querySelector(`.post-card[onclick*="${postId}"]`);
        if (postElement) {
            postElement.remove();
        }

        // If we're on post detail, go back to feed
        const postDetailScreen = document.getElementById('screenPostDetail');
        if (postDetailScreen && postDetailScreen.classList.contains('active')) {
            showFeedHome();
        }

    } catch (error) {
        console.error("Error deleting post:", error);
        alert('Error deleting post: ' + error.message);
    }
}
window.deletePost = deletePost;

// ============================================
// CREATE POST FUNCTIONS
// ============================================

// State for post creation
window.pendingPostImage = null;
window.pendingPostImageUrl = null;
window.pendingLinkUrl = null;
window.pendingLinkPreview = null;

// Show create post screen
function showCreatePost() {
    if (!window.currentUser) {
        alert('Please sign in to create a post');
        return;
    }

    // Update avatar and name
    updateFeedUserAvatar();

    // Clear previous state
    document.getElementById('createPostInput').value = '';
    document.getElementById('createPostImagePreview').style.display = 'none';
    document.getElementById('createPostLinkPreview').style.display = 'none';
    window.pendingPostImage = null;
    window.pendingPostImageUrl = null;
    window.pendingLinkUrl = null;
    window.pendingLinkPreview = null;

    // Show screen
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = '';
    });
    const screen = document.getElementById('screenCreatePost');
    if (screen) {
        screen.classList.add('active');
        screen.style.display = 'block';
    }

    // Hide tab bar
    document.body.classList.add('hide-tab-bar');
    hideGlobalHeader();

    // Focus input
    setTimeout(() => {
        document.getElementById('createPostInput')?.focus();
    }, 100);
}
window.showCreatePost = showCreatePost;

// Hide create post screen
function hideCreatePost() {
    showFeedHome();
}
window.hideCreatePost = hideCreatePost;

// Trigger image upload
function triggerPostImageUpload() {
    document.getElementById('postImageInput')?.click();
}
window.triggerPostImageUpload = triggerPostImageUpload;

// Handle image selection
async function handlePostImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('Image must be less than 10MB');
        return;
    }

    // Convert HEIC if needed
    let processedFile = file;
    if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
        try {
            const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 });
            processedFile = new File([blob], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
        } catch (e) {
            console.error('HEIC conversion failed:', e);
        }
    }

    window.pendingPostImage = processedFile;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('createPostImagePreviewImg').src = e.target.result;
        document.getElementById('createPostImagePreview').style.display = 'block';
    };
    reader.readAsDataURL(processedFile);

    // Clear link preview if showing image
    window.pendingLinkUrl = null;
    window.pendingLinkPreview = null;
    document.getElementById('createPostLinkPreview').style.display = 'none';
}
window.handlePostImageSelect = handlePostImageSelect;

// Remove post image
function removePostImage() {
    window.pendingPostImage = null;
    window.pendingPostImageUrl = null;
    document.getElementById('createPostImagePreview').style.display = 'none';
    document.getElementById('postImageInput').value = '';
}
window.removePostImage = removePostImage;

// Handle post input change (detect URLs)
let linkDetectTimeout = null;
function handlePostInputChange() {
    const input = document.getElementById('createPostInput');
    const content = input.value;

    // Don't detect links if we already have an image
    if (window.pendingPostImage) return;

    // Debounce URL detection
    clearTimeout(linkDetectTimeout);
    linkDetectTimeout = setTimeout(() => {
        detectAndFetchLinkPreview(content);
    }, 500);
}
window.handlePostInputChange = handlePostInputChange;

// Detect URL in text and fetch preview
async function detectAndFetchLinkPreview(text) {
    // Simple URL regex
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = text.match(urlRegex);

    if (!matches || matches.length === 0) {
        // No URL found, hide preview
        if (!window.pendingLinkUrl) {
            document.getElementById('createPostLinkPreview').style.display = 'none';
        }
        return;
    }

    const url = matches[0];

    // Don't re-fetch if same URL
    if (url === window.pendingLinkUrl) return;

    window.pendingLinkUrl = url;

    // Show loading state
    document.getElementById('createPostLinkPreview').style.display = 'block';
    document.getElementById('linkPreviewLoading').style.display = 'flex';
    document.getElementById('linkPreviewContent').style.display = 'none';

    try {
        // Call cloud function to fetch link preview
        const functionsBaseUrl = window.FUNCTIONS_EMULATOR_URL || 'https://us-central1-bandcal-89c81.cloudfunctions.net';
        const response = await fetch(`${functionsBaseUrl}/fetchLinkPreview?url=${encodeURIComponent(url)}`);

        if (!response.ok) {
            throw new Error('Failed to fetch preview');
        }

        const preview = await response.json();

        // Check if URL is still the same (user might have changed text)
        if (url !== window.pendingLinkUrl) return;

        window.pendingLinkPreview = preview;

        // Update preview UI
        document.getElementById('linkPreviewLoading').style.display = 'none';
        document.getElementById('linkPreviewContent').style.display = 'block';

        if (preview.image) {
            document.getElementById('linkPreviewImage').src = preview.image;
            document.getElementById('linkPreviewImage').style.display = 'block';
        } else {
            document.getElementById('linkPreviewImage').style.display = 'none';
        }

        document.getElementById('linkPreviewTitle').textContent = preview.title || url;
        document.getElementById('linkPreviewDescription').textContent = preview.description || '';
        document.getElementById('linkPreviewUrl').textContent = new URL(url).hostname;

    } catch (error) {
        console.error('Error fetching link preview:', error);
        // Hide preview on error
        document.getElementById('createPostLinkPreview').style.display = 'none';
        window.pendingLinkUrl = null;
        window.pendingLinkPreview = null;
    }
}

// Remove post link
function removePostLink() {
    window.pendingLinkUrl = null;
    window.pendingLinkPreview = null;
    document.getElementById('createPostLinkPreview').style.display = 'none';
}
window.removePostLink = removePostLink;

// Upload post image to Firebase Storage
async function uploadPostImage(file) {
    const userId = window.currentUser.uid;
    const timestamp = Date.now();
    const fileRef = storageRef(storage, `post-images/${userId}/${timestamp}_${file.name}`);
    await uploadBytes(fileRef, file);
    return await getDownloadURL(fileRef);
}

// Submit post
async function submitPost() {
    const content = document.getElementById('createPostInput').value.trim();

    if (!content && !window.pendingPostImage) {
        alert('Please enter some text or add an image');
        return;
    }

    if (!window.currentUser || !window.currentUserProfile) {
        alert('Please sign in to post');
        return;
    }

    const submitBtn = document.getElementById('submitPostBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting...';

    try {
        let imageUrl = null;

        // Upload image if present
        if (window.pendingPostImage) {
            imageUrl = await uploadPostImage(window.pendingPostImage);
        }

        // Create post document
        const postData = {
            authorId: window.currentUser.uid,
            authorName: window.currentUserProfile.name || 'Anonymous',
            authorPhoto: window.currentUserProfile.profilePhotos?.[0] || '',
            authorInstruments: window.currentUserProfile.instruments || [],
            content: content,
            commentCount: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        if (imageUrl) {
            postData.imageUrl = imageUrl;
        }

        if (window.pendingLinkUrl && window.pendingLinkPreview) {
            postData.linkUrl = window.pendingLinkUrl;
            postData.linkPreview = window.pendingLinkPreview;
        }

        await addDoc(collection(db, "posts"), postData);

        // Clear state and go back to feed
        window.pendingPostImage = null;
        window.pendingPostImageUrl = null;
        window.pendingLinkUrl = null;
        window.pendingLinkPreview = null;

        showFeedHome();

    } catch (error) {
        console.error("Error creating post:", error);
        alert('Error creating post: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Post';
    }
}
window.submitPost = submitPost;

// ============================================
// POST DETAIL & COMMENTS
// ============================================

window.currentPostId = null;
window.currentPostData = null;

// Show post detail
async function showPostDetail(postId) {
    window.currentPostId = postId;

    // Show screen
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = '';
    });
    const screen = document.getElementById('screenPostDetail');
    if (screen) {
        screen.classList.add('active');
        screen.style.display = 'block';
    }

    // Hide tab bar
    document.body.classList.add('hide-tab-bar');
    hideGlobalHeader();

    // Clear previous content
    document.getElementById('postDetailContent').innerHTML = '<div class="feed-loading"><div class="spinner"></div></div>';
    document.getElementById('postCommentsList').innerHTML = '';
    document.getElementById('postCommentsCount').textContent = '0 comments';

    try {
        // Fetch post
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);

        if (!postSnap.exists()) {
            document.getElementById('postDetailContent').innerHTML = '<div class="feed-error">Post not found</div>';
            return;
        }

        const post = { id: postSnap.id, ...postSnap.data() };
        window.currentPostData = post;

        // Render post
        const isOwner = window.currentUser?.uid === post.authorId;
        const timeAgo = formatTimeAgo(post.createdAt?.toDate ? post.createdAt.toDate() : post.createdAt);
        const instruments = post.authorInstruments?.join(', ') || '';
        const meta = instruments ? `${instruments} · ${timeAgo}` : timeAgo;

        let imageHtml = '';
        if (post.imageUrl) {
            imageHtml = `<div class="post-detail-image"><img src="${post.imageUrl}" alt="Post image" onclick="viewSingleImage('${post.imageUrl}')"></div>`;
        }

        let linkPreviewHtml = '';
        if (post.linkPreview && post.linkUrl) {
            linkPreviewHtml = `
                <a href="${escapeHtml(post.linkUrl)}" target="_blank" rel="noopener" class="post-link-preview">
                    ${post.linkPreview.image ? `<img class="post-link-image" src="${escapeHtml(post.linkPreview.image)}" alt="">` : ''}
                    <div class="post-link-info">
                        <div class="post-link-title">${escapeHtml(post.linkPreview.title || post.linkUrl)}</div>
                        ${post.linkPreview.description ? `<div class="post-link-description">${escapeHtml(post.linkPreview.description)}</div>` : ''}
                        <div class="post-link-url">${escapeHtml(new URL(post.linkUrl).hostname)}</div>
                    </div>
                </a>
            `;
        }

        const deleteHtml = isOwner ? `
            <button class="post-delete-btn" onclick="deletePost('${post.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
                Delete Post
            </button>
        ` : '';

        document.getElementById('postDetailContent').innerHTML = `
            <div class="post-detail-author" onclick="viewMusicianProfile('${post.authorId}')">
                <div class="post-author-photo" style="background-image: url('${post.authorPhoto || ''}'); ${!post.authorPhoto ? 'background-color: #333;' : ''}"></div>
                <div class="post-author-info">
                    <span class="post-author-name">${escapeHtml(post.authorName || 'Anonymous')}</span>
                    <span class="post-author-meta">${escapeHtml(meta)}</span>
                </div>
            </div>
            <div class="post-detail-text">${escapeHtml(post.content || '')}</div>
            ${imageHtml}
            ${linkPreviewHtml}
            ${deleteHtml}
        `;

        // Update comment count
        document.getElementById('postCommentsCount').textContent = `${post.commentCount || 0} comment${post.commentCount === 1 ? '' : 's'}`;

        // Load comments
        loadComments(postId);

    } catch (error) {
        console.error("Error loading post:", error);
        document.getElementById('postDetailContent').innerHTML = '<div class="feed-error">Error loading post</div>';
    }
}
window.showPostDetail = showPostDetail;

// Hide post detail
function hidePostDetail() {
    window.currentPostId = null;
    window.currentPostData = null;
    showFeedHome();
}
window.hidePostDetail = hidePostDetail;

// Load comments for a post
async function loadComments(postId) {
    const commentsList = document.getElementById('postCommentsList');

    try {
        const commentsQuery = query(
            collection(db, "posts", postId, "comments"),
            orderBy("createdAt", "asc")
        );

        const snapshot = await getDocs(commentsQuery);

        if (snapshot.empty) {
            commentsList.innerHTML = '<div class="no-comments">No comments yet. Be the first!</div>';
            return;
        }

        let commentsHtml = '';
        snapshot.forEach(docSnap => {
            const comment = { id: docSnap.id, ...docSnap.data() };
            commentsHtml += renderComment(comment, postId);
        });

        commentsList.innerHTML = commentsHtml;

    } catch (error) {
        console.error("Error loading comments:", error);
        commentsList.innerHTML = '<div class="feed-error">Error loading comments</div>';
    }
}
window.loadComments = loadComments;

// Render a comment
function renderComment(comment, postId) {
    const isOwner = window.currentUser?.uid === comment.authorId;
    const timeAgo = formatTimeAgo(comment.createdAt?.toDate ? comment.createdAt.toDate() : comment.createdAt);

    const deleteHtml = isOwner ? `
        <button class="comment-delete-btn" onclick="deleteComment('${postId}', '${comment.id}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
    ` : '';

    return `
        <div class="comment-card" data-comment-id="${comment.id}">
            <div class="comment-avatar" style="background-image: url('${comment.authorPhoto || ''}'); ${!comment.authorPhoto ? 'background-color: #333;' : ''}" onclick="viewMusicianProfile('${comment.authorId}')"></div>
            <div class="comment-body">
                <div class="comment-header">
                    <span class="comment-author" onclick="viewMusicianProfile('${comment.authorId}')">${escapeHtml(comment.authorName || 'Anonymous')}</span>
                    <span class="comment-time">${timeAgo}</span>
                    ${deleteHtml}
                </div>
                <div class="comment-content">${escapeHtml(comment.content)}</div>
            </div>
        </div>
    `;
}

// Handle comment keypress (submit on Enter)
function handleCommentKeypress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitComment();
    }
}
window.handleCommentKeypress = handleCommentKeypress;

// Submit comment
async function submitComment() {
    const input = document.getElementById('commentInput');
    const content = input.value.trim();

    if (!content || !window.currentPostId) return;

    if (!window.currentUser || !window.currentUserProfile) {
        alert('Please sign in to comment');
        return;
    }

    input.disabled = true;

    try {
        // Add comment
        await addDoc(collection(db, "posts", window.currentPostId, "comments"), {
            authorId: window.currentUser.uid,
            authorName: window.currentUserProfile.name || 'Anonymous',
            authorPhoto: window.currentUserProfile.profilePhotos?.[0] || '',
            content: content,
            createdAt: serverTimestamp()
        });

        // Increment comment count on post
        await updateDoc(doc(db, "posts", window.currentPostId), {
            commentCount: increment(1)
        });

        // Clear input
        input.value = '';

        // Reload comments
        loadComments(window.currentPostId);

        // Update comment count display
        const currentCount = window.currentPostData?.commentCount || 0;
        const newCount = currentCount + 1;
        window.currentPostData.commentCount = newCount;
        document.getElementById('postCommentsCount').textContent = `${newCount} comment${newCount === 1 ? '' : 's'}`;

    } catch (error) {
        console.error("Error submitting comment:", error);
        alert('Error adding comment: ' + error.message);
    } finally {
        input.disabled = false;
        input.focus();
    }
}
window.submitComment = submitComment;

// Delete comment
async function deleteComment(postId, commentId) {
    if (!window.currentUser) return;

    const confirmed = confirm('Delete this comment?');
    if (!confirmed) return;

    try {
        // Verify ownership
        const commentRef = doc(db, "posts", postId, "comments", commentId);
        const commentSnap = await getDoc(commentRef);

        if (!commentSnap.exists()) {
            alert('Comment not found');
            return;
        }

        if (commentSnap.data().authorId !== window.currentUser.uid) {
            alert('You can only delete your own comments');
            return;
        }

        // Delete comment
        await deleteDoc(commentRef);

        // Decrement comment count
        await updateDoc(doc(db, "posts", postId), {
            commentCount: increment(-1)
        });

        // Remove from DOM
        const commentElement = document.querySelector(`.comment-card[data-comment-id="${commentId}"]`);
        if (commentElement) {
            commentElement.remove();
        }

        // Update count display
        if (window.currentPostData) {
            const newCount = Math.max(0, (window.currentPostData.commentCount || 1) - 1);
            window.currentPostData.commentCount = newCount;
            document.getElementById('postCommentsCount').textContent = `${newCount} comment${newCount === 1 ? '' : 's'}`;
        }

    } catch (error) {
        console.error("Error deleting comment:", error);
        alert('Error deleting comment: ' + error.message);
    }
}
window.deleteComment = deleteComment;
