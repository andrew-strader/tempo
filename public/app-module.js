// Import Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-storage.js";
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
                            <span>✓ Calendar Connected</span>
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
    } else if (user && window.pendingShowProfile) {
        window.pendingShowProfile = false;
        showEditProfile();
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
    
    if (user) {
        // Use profile photo if available, otherwise Google photo
        const photoURL = window.currentUserProfile?.photoURL || user.photoURL || '';
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
    } else {
        if (userInfo) userInfo.style.display = 'none';
        if (signInPromptHome) signInPromptHome.style.display = 'block';
    }
}

function showHomeScreen() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen0').classList.add('active');
    hideGlobalHeader();
    // Clear URL params
    window.history.replaceState({}, '', '/');
}

window.showHomeScreen = showHomeScreen;

// Handle browser back/forward buttons
window.addEventListener('popstate', function(event) {
    const path = window.location.pathname;
    
    if (path === '/' || path === '') {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('screen0').classList.add('active');
    } else if (path === '/bands') {
        if (window.currentUser) showMyBands();
    } else if (path === '/profile') {
        if (window.currentUser) showEditProfile();
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
    toggleMenu();
    showHomeScreen();
}

function goToMyGigs() {
    toggleMenu();
    showMyGigs();
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
        // Use profile photo if available, otherwise Google photo
        const photoURL = window.currentUserProfile?.photoURL || user.photoURL || '';
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
    
    // Reset photo state
    const avatar = document.getElementById('profileSetupAvatar');
    avatar.style.backgroundImage = '';
    avatar.classList.remove('has-photo');
    avatar.textContent = '🎵';
    
    // Pre-fill with Google account info
    if (window.currentUser) {
        document.getElementById('profileName').value = window.currentUser.displayName || '';
        if (window.currentUser.photoURL) {
            avatar.textContent = '';
            avatar.style.backgroundImage = `url(${window.currentUser.photoURL})`;
            avatar.classList.add('has-photo');
        }
    }
    
    // Check if calendar is already connected
    const setupCalStatus = document.getElementById('setupCalendarStatus');
    if (setupCalStatus && window.currentUserProfile?.calendarConnected) {
        setupCalStatus.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; color: #4CAF50;">
                <span>✓ Calendar Connected</span>
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
        
        // Upload photo if one was selected
        let photoURL = user.photoURL || null;
        if (window.pendingProfilePhoto) {
            const uploadedURL = await uploadProfilePhoto(user.uid);
            if (uploadedURL) {
                photoURL = uploadedURL;
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
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        await setDoc(doc(db, "users", user.uid), profileData);
        
        window.currentUserProfile = profileData;
        console.log("Profile saved successfully");
        
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
    window.history.pushState({}, '', '/profile');
    
    // Reset photo state
    const avatar = document.getElementById('editProfileAvatar');
    avatar.style.backgroundImage = '';
    avatar.classList.remove('has-photo');
    avatar.textContent = '🎵';
    
    // Load current profile data
    const user = window.currentUser;
    if (!user) {
        alert('Please sign in first');
        showHomeScreen();
        return;
    }
    
    // Helper to load avatar
    function loadAvatar(url) {
        if (url) {
            avatar.textContent = '';
            avatar.style.backgroundImage = `url(${url})`;
            avatar.classList.add('has-photo');
        }
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
        
        // Load avatar from profile or Google
        const profile = window.currentUserProfile;
        if (profile?.photoURL) {
            loadAvatar(profile.photoURL);
        } else if (user.photoURL) {
            loadAvatar(user.photoURL);
        }
        
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
        loadAvatar(profile.photoURL);
        
        // Show calendar connection status
        updateCalendarUI(profile.calendarConnected);
    } else {
        // No profile, use Google account info
        document.getElementById('editProfileName').value = user.displayName || '';
        loadAvatar(user.photoURL);
        updateCalendarUI(false);
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
        
        // Upload photo if one was selected
        let photoURL = window.currentUserProfile?.photoURL || user.photoURL || null;
        if (window.pendingProfilePhoto) {
            const uploadedURL = await uploadProfilePhoto(user.uid);
            if (uploadedURL) {
                photoURL = uploadedURL;
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

// Handle profile photo selection
async function handleProfilePhotoSelect(event, mode) {
    let file = event.target.files[0];
    if (!file) return;
    
    const avatarId = mode === 'setup' ? 'profileSetupAvatar' : 'editProfileAvatar';
    const avatar = document.getElementById(avatarId);
    
    // Show loading state
    avatar.classList.remove('has-photo');
    avatar.style.backgroundImage = '';
    avatar.textContent = '⏳';
    
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
            avatar.textContent = '🎵';
            return;
        }
    }
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        avatar.textContent = '🎵';
        return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('Image must be less than 5MB');
        avatar.textContent = '🎵';
        return;
    }
    
    // Show preview
    const reader = new FileReader();
    reader.onload = function(e) {
        console.log('FileReader loaded, setting preview');
        avatar.textContent = '';
        avatar.style.backgroundImage = `url(${e.target.result})`;
        avatar.classList.add('has-photo');
        console.log('Preview set, has-photo class added');
    };
    reader.onerror = function(e) {
        console.error('FileReader error:', e);
        avatar.textContent = '🎵';
    };
    reader.readAsDataURL(file);
    console.log('Reading file as data URL:', file.name, file.type);
    
    // Store file for upload when saving
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
                    <div class="empty-state-icon">🎵</div>
                    <p>No musicians found matching your search</p>
                </div>
            `;
            return;
        }
        
        resultsDiv.innerHTML = musicians.map(m => `
            <div class="musician-card" onclick="viewMusicianProfile('${m.id}')">
                <div class="musician-card-header">
                    ${m.photoURL 
                        ? `<img src="${m.photoURL}" class="musician-card-avatar" onerror="this.outerHTML='<div class=\\'musician-card-avatar-placeholder\\'>🎵</div>'">`
                        : `<div class="musician-card-avatar-placeholder">🎵</div>`
                    }
                    <div class="musician-card-info">
                        <div class="musician-card-name">${escapeHtml(m.name)}</div>
                        ${m.location ? `<div class="musician-card-location">📍 ${escapeHtml(m.location)}</div>` : ''}
                    </div>
                </div>
                <div class="musician-card-instruments">
                    ${(m.instruments || []).map(i => `<span class="instrument-tag">${getInstrumentLabel(i)}</span>`).join('')}
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error("Error searching musicians:", error);
        resultsDiv.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
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
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screenMusicianProfile').classList.add('active');
    
    // Store for contact
    window.viewingMusicianId = userId;
    
    // Check if viewing own profile
    const isOwnProfile = window.currentUser && window.currentUser.uid === userId;
    
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
        document.getElementById('viewProfileLocation').textContent = profile.location ? `📍 ${profile.location}` : '';
        
        if (profile.photoURL) {
            document.getElementById('viewProfileAvatar').src = profile.photoURL;
            document.getElementById('viewProfileAvatar').style.display = 'block';
            document.getElementById('viewProfileAvatarPlaceholder').style.display = 'none';
        } else {
            document.getElementById('viewProfileAvatar').style.display = 'none';
            document.getElementById('viewProfileAvatarPlaceholder').style.display = 'flex';
        }
        
        const instrumentsDiv = document.getElementById('viewProfileInstruments');
        instrumentsDiv.innerHTML = (profile.instruments || [])
            .map(i => `<span class="instrument-tag">${getInstrumentLabel(i)}</span>`)
            .join('');
        
        if (profile.bio) {
            document.getElementById('viewProfileBio').textContent = profile.bio;
            document.getElementById('viewProfileBioCard').style.display = 'block';
        } else {
            document.getElementById('viewProfileBioCard').style.display = 'none';
        }
        
        // Update buttons based on whether viewing own profile
        const contactBtn = document.getElementById('contactMusicianBtn');
        const backBtn = document.getElementById('profileBackBtn');
        
        if (isOwnProfile) {
            contactBtn.innerHTML = '✏️ Edit Profile';
            contactBtn.onclick = function() { showEditProfile(); };
            backBtn.innerHTML = '← Back to Home';
            backBtn.onclick = function() { showHomeScreen(); };
        } else {
            contactBtn.innerHTML = '✉️ Contact';
            contactBtn.onclick = function() { contactMusician(); };
            backBtn.innerHTML = '← Back to Search';
            backBtn.onclick = function() { showMusicianDiscovery(); };
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
                    <div class="empty-state-icon">🎸</div>
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
                    ${band.role === 'leader' ? '👑 Leader' : band.role === 'admin' ? '🔧 Admin' : '🎵 Member'}
                    ${band.memberCount ? ` • ${band.memberCount} members` : ''}
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error("Error loading bands:", error);
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
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
    photoPreview.textContent = '🎸';
    
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
            preview.textContent = '🎸';
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
                        <h2 style="color: #333;">Hey ${toName}! 🎸</h2>
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
                subject: `👑 You're invited to lead ${bandName} on Tempo`,
                html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">Hey ${toName}! 👑</h2>
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
            photoEl.textContent = '🎸';
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
        btn.textContent = '✓ Copied!';
        setTimeout(() => {
            btn.textContent = '📋 Copy Link';
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
            photoEl.textContent = '🎸';
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
                        <div class="member-name">${escapeHtml(band.leaderName || 'Leader')} 👑</div>
                        <div class="member-email">${escapeHtml(band.leaderEmail || '')}</div>
                    </div>
                    <span class="member-status pending">Pending Leader</span>
                </div>
            `;
        } else {
            html += `
                <div class="member-item">
                    <div class="member-info">
                        <div class="member-name">${escapeHtml(band.leaderName || 'Leader')} 👑</div>
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
                    ${canManage ? `<button class="member-remove" onclick="removeBandMember('${docSnap.id}')">×</button>` : ''}
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
                    subject: `🎸 New Gig: ${gigData.bandName} at ${gigData.venue}`,
                    html: `
                        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #333;">Hey ${member.name}! 🎵</h2>
                            <p style="color: #555; font-size: 16px; line-height: 1.6;">
                                A new gig has been scheduled for <strong>${gigData.bandName}</strong>!
                            </p>
                            
                            <div style="background: #f8f8f8; border-radius: 12px; padding: 20px; margin: 20px 0;">
                                <p style="margin: 0 0 8px; color: #333;"><strong>📍 Venue:</strong> ${gigData.venue}</p>
                                <p style="margin: 0 0 8px; color: #333;"><strong>📅 Date:</strong> ${formattedDate}</p>
                                ${gigData.setTime ? `<p style="margin: 0; color: #333;"><strong>🎤 Set Time:</strong> ${gigData.setTime}</p>` : ''}
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
    document.getElementById('screen0').classList.remove('active');
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

// Check for /profile path
const isProfilePage = window.location.pathname === '/profile';

// Route to appropriate view
if (isPrivacyPage) {
    document.getElementById('screen0').classList.remove('active');
    showPrivacy();
} else if (isTermsPage) {
    document.getElementById('screen0').classList.remove('active');
    showTerms();
} else if (isBandsPage) {
    // Will be handled after auth
    window.pendingShowBands = true;
} else if (isProfilePage) {
    // Will be handled after auth
    window.pendingShowProfile = true;
} else if (bandDetailId) {
    // Will be handled after auth
    window.pendingBandDetail = bandDetailId;
} else if (bandInviteId) {
    // Band invite via /b/ path - show landing page
    document.getElementById('screen0').classList.remove('active');
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
    document.getElementById('screen0').classList.remove('active');
    showGlobalHeader();
    loadEventCard(eventGigId);
} else if (leaderGigId) {
    // Leader dashboard view
    document.getElementById('screen0').classList.remove('active');
    document.getElementById('screen6').classList.add('active');
    window.currentGigId = leaderGigId;
    loadDashboard(leaderGigId);
} else if (gigId) {
    // Musician availability view
    document.getElementById('screen0').classList.remove('active');
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
                                <div class="audio-file-name">🎵 ${file.name}</div>
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
                    <div class="slot-check">✓</div>
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
        { emoji: "🏠", title: "New home feed", desc: "discover musicians and see what's happening" },
        { emoji: "📱", title: "Bottom tabs", desc: "faster access to your gigs and bands" },
        { emoji: "👤", title: "Richer profiles", desc: "add your gear, influences, and more" }
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
                    `<li>${item.emoji} <strong>${item.title}</strong> — ${item.desc}</li>`
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
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
    
    // Handle tab action
    switch(tab) {
        case 'home':
            showDiscoveryHome();
            break;
        case 'gigs':
            showMyGigs();
            break;
        case 'bands':
            showMyBands();
            break;
        case 'create':
            openCreateSheet();
            break;
    }
}
window.switchTab = switchTab;

// Show discovery home screen
function showDiscoveryHome() {
    hideAllScreens();
    document.getElementById('screen0').classList.add('active');
    showGlobalHeader();
    document.body.classList.remove('hide-tab-bar');
    document.getElementById('bottomTabBar').style.display = 'flex';
    loadDiscoveryFeed();
}
window.showDiscoveryHome = showDiscoveryHome;

// Load the discovery feed
async function loadDiscoveryFeed() {
    const feedContent = document.getElementById('feedContent');
    const feedLoading = document.getElementById('feedLoading');
    const feedEmpty = document.getElementById('feedEmpty');
    
    feedLoading.style.display = 'flex';
    feedEmpty.style.display = 'none';
    feedContent.innerHTML = '';
    
    try {
        // Query discoverable users
        const usersQuery = query(
            collection(db, "users"),
            where("discoverable", "==", true)
        );
        
        const snapshot = await getDocs(usersQuery);
        feedLoading.style.display = 'none';
        
        if (snapshot.empty) {
            feedEmpty.style.display = 'block';
            return;
        }
        
        const musicians = [];
        snapshot.forEach(doc => {
            // Don't show current user in feed
            if (window.currentUser && doc.id === window.currentUser.uid) return;
            musicians.push({ id: doc.id, ...doc.data() });
        });
        
        if (musicians.length === 0) {
            feedEmpty.style.display = 'block';
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
        feedContent.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">Error loading feed. Please try again.</p>';
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
    
    // Avatar
    let avatarContent = '';
    if (musician.photoURL) {
        avatarContent = `<img src="${musician.photoURL}" alt="${escapeHtml(musician.name)}">`;
    } else {
        avatarContent = '🎵';
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
    // Update active pill
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.filter === filter);
    });
    
    // For now, just reload - we can add actual filtering later
    // TODO: Implement filtering by instrument, availability, etc.
    loadDiscoveryFeed();
}
window.setDiscoveryFilter = setDiscoveryFilter;

// Create sheet functions
function openCreateSheet() {
    document.getElementById('createSheetOverlay').classList.add('visible');
    document.getElementById('createSheet').classList.add('visible');
}
window.openCreateSheet = openCreateSheet;

function closeCreateSheet() {
    document.getElementById('createSheetOverlay').classList.remove('visible');
    document.getElementById('createSheet').classList.remove('visible');
    
    // Reset the Create tab to not be active (home should be)
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tabHome').classList.add('active');
}
window.closeCreateSheet = closeCreateSheet;

// Override goHome to use new discovery home
const originalGoHome = goHome;
function goHome() {
    toggleMenu();
    showDiscoveryHome();
    
    // Update tab bar
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tabHome').classList.add('active');
}
window.goHome = goHome;

// Override showHomeScreen to use new discovery home
const originalShowHomeScreen = showHomeScreen;
function showHomeScreen() {
    showDiscoveryHome();
    
    // Check if we should show "What's New" modal
    setTimeout(() => {
        checkWhatsNew();
    }, 500);
}
window.showHomeScreen = showHomeScreen;

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
