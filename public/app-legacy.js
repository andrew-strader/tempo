let slotCount = 2;
let currentGigId = null;

function goToScreen1() {
    document.getElementById('screen2').classList.remove('active');
    document.getElementById('screen1').classList.add('active');
}

function goBackToScreen2() {
    document.getElementById('screen2b').classList.remove('active');
    document.getElementById('screen2').classList.add('active');
}

function goToScreen2() {
    const bandName = document.getElementById('bandName').value;
    const venue = document.getElementById('venue').value;
    
    if (!bandName || !venue) {
        alert('Please enter band name and venue');
        return;
    }
    
    document.getElementById('screen2Subtitle').textContent = `${bandName} @ ${venue}`;
    document.getElementById('screen1').classList.remove('active');
    document.getElementById('screen2').classList.add('active');
}

function goToScreen2b() {
    // Validate rehearsal slots first
    let hasValidSlot = false;
    let hasIncompleteSlot = false;
    
    document.querySelectorAll('.rehearsal-slot').forEach(slot => {
        const date = slot.querySelector('.slot-date').value;
        const time = slot.querySelector('.slot-time').value;
        
        if (date && time) {
            hasValidSlot = true;
        } else if (date || time) {
            hasIncompleteSlot = true;
        }
    });
    
    if (!hasValidSlot) {
        alert('Please add at least one rehearsal time option with both date and time filled in.');
        return;
    }
    
    if (hasIncompleteSlot) {
        alert('Some rehearsal options are incomplete. Please fill in both date and time for each option, or remove empty ones.');
        return;
    }
    
    const bandName = document.getElementById('bandName').value;
    const venue = document.getElementById('venue').value;
    document.getElementById('screen2bSubtitle').textContent = `${bandName} @ ${venue}`;
    document.getElementById('screen2').classList.remove('active');
    document.getElementById('screen2b').classList.add('active');
}

// Setlist management
window.setlistSongs = [];

function addSong() {
    const titleInput = document.getElementById('newSongTitle');
    const durationInput = document.getElementById('newSongDuration');
    
    const title = titleInput.value.trim();
    if (!title) {
        alert('Please enter a song title');
        return;
    }
    
    const duration = durationInput.value.trim();
    
    window.setlistSongs.push({ title, duration, files: [] });
    renderSetlist();
    
    // Clear inputs
    titleInput.value = '';
    durationInput.value = '';
    titleInput.focus();
}

function removeSong(index) {
    window.setlistSongs.splice(index, 1);
    renderSetlist();
}

function renderSetlist() {
    const container = document.getElementById('setlistItems');
    container.innerHTML = '';
    
    window.setlistSongs.forEach((song, index) => {
        const el = document.createElement('div');
        el.className = 'setlist-item-expanded';
        
        const filesHtml = (song.files || []).map((file, fileIndex) => `
            <div class="song-file">
                <span class="song-file-icon">${file.type === 'audio' ? '🎵' : '📄'}</span>
                <span class="song-file-name">${file.name}</span>
                <span class="song-file-remove" onclick="removeSongFile(${index}, ${fileIndex})">×</span>
            </div>
        `).join('');
        
        el.innerHTML = `
            <div class="setlist-item-header">
                <div class="setlist-number">${index + 1}</div>
                <div class="setlist-info">
                    <div class="setlist-title">${song.title}</div>
                    ${song.duration ? `<div class="setlist-duration">${song.duration}</div>` : ''}
                </div>
                <span class="setlist-remove" onclick="removeSong(${index})">×</span>
            </div>
            <div class="song-files-section">
                ${filesHtml}
                <label class="song-file-upload" onclick="document.getElementById('songFileInput-${index}').click()">
                    + Add audio or chart
                </label>
                <input type="file" id="songFileInput-${index}" accept="audio/*,.pdf" style="display:none" onchange="handleSongFileSelect(event, ${index})">
            </div>
        `;
        container.appendChild(el);
    });
}

async function handleSongFileSelect(event, songIndex) {
    const file = event.target.files[0];
    if (!file) return;
    
    const song = window.setlistSongs[songIndex];
    if (!song.files) song.files = [];
    
    // Add placeholder while uploading
    const fileData = {
        name: file.name,
        type: file.type.startsWith('audio/') ? 'audio' : 'pdf',
        status: 'uploading',
        url: null
    };
    song.files.push(fileData);
    renderSetlist();
    
    // Upload to Firebase
    try {
        const storageRef = window.storageRef(window.storage, `gigs/songs/${Date.now()}_${file.name}`);
        const snapshot = await window.uploadBytes(storageRef, file);
        const url = await window.getDownloadURL(snapshot.ref);
        
        fileData.url = url;
        fileData.status = 'uploaded';
        renderSetlist();
    } catch (error) {
        console.error('Upload error:', error);
        // Remove failed upload
        song.files = song.files.filter(f => f !== fileData);
        renderSetlist();
        alert('Error uploading file: ' + error.message);
    }
    
    event.target.value = '';
}

function removeSongFile(songIndex, fileIndex) {
    window.setlistSongs[songIndex].files.splice(fileIndex, 1);
    renderSetlist();
}

// File upload management
window.uploadedFiles = [];
window.showGraphic = null;

async function handleShowGraphicSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('showGraphicImg').src = e.target.result;
        document.getElementById('showGraphicPreview').style.display = 'block';
        document.getElementById('showGraphicUpload').style.display = 'none';
    };
    reader.readAsDataURL(file);
    
    // Upload to Firebase
    try {
        const storageRef = window.storageRef(window.storage, `gigs/${Date.now()}_${file.name}`);
        const snapshot = await window.uploadBytes(storageRef, file);
        const url = await window.getDownloadURL(snapshot.ref);
        
        window.showGraphic = {
            name: file.name,
            type: 'image',
            url: url
        };
    } catch (error) {
        console.error('Upload error:', error);
        alert('Error uploading image: ' + error.message);
    }
    
    event.target.value = '';
}

function removeShowGraphic() {
    window.showGraphic = null;
    document.getElementById('showGraphicPreview').style.display = 'none';
    document.getElementById('showGraphicUpload').style.display = 'block';
}

async function handleFileSelect(event) {
    const files = event.target.files;
    if (!files.length) return;
    
    for (const file of files) {
        // Add to list with uploading status
        const fileData = {
            name: file.name,
            size: formatFileSize(file.size),
            type: getFileType(file),
            file: file,
            status: 'uploading',
            url: null
        };
        
        window.uploadedFiles.push(fileData);
        renderUploadedFiles();
        
        // Upload to Firebase Storage
        try {
            const storageRef = window.storageRef(window.storage, `gigs/${Date.now()}_${file.name}`);
            const snapshot = await window.uploadBytes(storageRef, file);
            const url = await window.getDownloadURL(snapshot.ref);
            
            // Update file data with URL
            fileData.url = url;
            fileData.status = 'uploaded';
            renderUploadedFiles();
        } catch (error) {
            console.error('Upload error:', error);
            fileData.status = 'error';
            renderUploadedFiles();
        }
    }
    
    // Clear input for next upload
    event.target.value = '';
}

function removeUploadedFile(index) {
    window.uploadedFiles.splice(index, 1);
    renderUploadedFiles();
}

function renderUploadedFiles() {
    const container = document.getElementById('uploadedFiles');
    container.innerHTML = '';
    
    window.uploadedFiles.forEach((file, index) => {
        const el = document.createElement('div');
        el.className = 'uploaded-file' + (file.status === 'uploading' ? ' uploading' : '');
        
        let icon = '📄';
        if (file.type === 'image') icon = '🖼';
        else if (file.type === 'audio') icon = '🎵';
        else if (file.type === 'pdf') icon = '📑';
        
        const statusText = file.status === 'uploading' ? 'Uploading...' : 
                           file.status === 'error' ? 'Upload failed' : 'Uploaded';
        
        el.innerHTML = `
            <div class="uploaded-file-icon">${icon}</div>
            <div class="uploaded-file-info">
                <div class="uploaded-file-name">${file.name}</div>
                <div class="uploaded-file-size">${file.size} · <span class="uploaded-file-status">${statusText}</span></div>
            </div>
            <span class="uploaded-file-remove" onclick="removeUploadedFile(${index})">×</span>
        `;
        container.appendChild(el);
    });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getFileType(file) {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('audio/')) return 'audio';
    if (file.type === 'application/pdf') return 'pdf';
    return 'file';
}

function goToScreen3() {
    document.getElementById('screen2').classList.remove('active');
    document.getElementById('screen3').classList.add('active');
    
    // Hide sign-in prompt if already signed in
    const signInPrompt = document.getElementById('signInPromptScreen3');
    if (signInPrompt) {
        signInPrompt.style.display = window.currentUser ? 'none' : 'block';
    }
}

function addSlot() {
    slotCount++;
    const slotsContainer = document.getElementById('rehearsalSlots');
    const newSlot = document.createElement('div');
    newSlot.className = 'rehearsal-slot';
    newSlot.dataset.slot = slotCount;
    newSlot.innerHTML = `
        <div class="rehearsal-slot-header">
            <span class="rehearsal-number">Option ${slotCount}</span>
            <span class="remove-rehearsal" onclick="removeSlot(this)">Remove</span>
        </div>
        <div class="row">
            <input type="date" class="slot-date" min="2024-01-01" max="2099-12-31">
            <input type="time" class="slot-time">
        </div>
    `;
    slotsContainer.appendChild(newSlot);
}

function removeSlot(element) {
    const slots = document.querySelectorAll('.rehearsal-slot');
    if (slots.length > 1) {
        const slot = element.closest('.rehearsal-slot');
        slot.remove();
        renumberSlots();
    } else {
        alert('You need at least one rehearsal time option');
    }
}

function renumberSlots() {
    const slots = document.querySelectorAll('.rehearsal-slot');
    slots.forEach((slot, index) => {
        slot.querySelector('.rehearsal-number').textContent = `Option ${index + 1}`;
    });
    slotCount = slots.length;
}

function showStatus(message, isError = false) {
    const statusEl = document.getElementById('statusMessage');
    statusEl.className = 'status ' + (isError ? 'error' : 'success');
    statusEl.textContent = message;
    statusEl.style.display = 'block';
}

function hideStatus() {
    document.getElementById('statusMessage').style.display = 'none';
}

// Fill demo data for quick testing
function fillDemoData() {
    const bands = ['The Midnight Howlers', 'Electric Sheep', 'Velvet Thunder', 'Neon Ghosts', 'The Broken Arrows'];
    const venues = ['Mercury Lounge', 'Bowery Ballroom', 'Brooklyn Steel', 'Baby\'s All Right', 'Elsewhere'];
    
    const randomBand = bands[Math.floor(Math.random() * bands.length)];
    const randomVenue = venues[Math.floor(Math.random() * venues.length)];
    
    // Set show date to 2 weeks from now
    const showDate = new Date();
    showDate.setDate(showDate.getDate() + 14);
    const showDateStr = showDate.toISOString().split('T')[0];
    
    // Fill form fields
    document.getElementById('bandName').value = randomBand;
    document.getElementById('venue').value = randomVenue;
    document.getElementById('showDate').value = showDateStr;
    document.getElementById('loadIn').value = '18:00';
    document.getElementById('setTime').value = '21:00';
    
    // Move to step 2
    goToScreen2();
    
    // Fill rehearsal times after a brief delay (wait for DOM)
    setTimeout(async () => {
        // Calculate rehearsal dates
        const time1 = new Date(showDate);
        time1.setDate(time1.getDate() - 7);
        const time2 = new Date(showDate);
        time2.setDate(time2.getDate() - 5);
        const time3 = new Date(showDate);
        time3.setDate(time3.getDate() - 3);
        
        // Add a third slot
        addSlot();
        
        // Fill the slots
        const slots = document.querySelectorAll('.rehearsal-slot');
        if (slots[0]) {
            slots[0].querySelector('.slot-date').value = time1.toISOString().split('T')[0];
            slots[0].querySelector('.slot-time').value = '19:00';
        }
        if (slots[1]) {
            slots[1].querySelector('.slot-date').value = time2.toISOString().split('T')[0];
            slots[1].querySelector('.slot-time').value = '19:00';
        }
        if (slots[2]) {
            slots[2].querySelector('.slot-date').value = time3.toISOString().split('T')[0];
            slots[2].querySelector('.slot-time').value = '20:00';
        }
        
        // Fill rehearsal location
        document.getElementById('rehearsalLocation').value = '123 Practice Space, Brooklyn';
        
        // Generate and upload a random demo flyer
        await generateDemoFlyer(randomBand, randomVenue, showDateStr);
    }, 100);
}

// Generate a random flyer image using canvas
async function generateDemoFlyer(bandName, venue, dateStr) {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    
    // Random gradient background
    const colors = [
        ['#1a1a2e', '#16213e', '#0f3460'],
        ['#2d132c', '#801336', '#c72c41'],
        ['#0a1628', '#1e3a5f', '#3d5a80'],
        ['#1b1b2f', '#1f4068', '#e43f5a'],
        ['#0d0d0d', '#1a1a1a', '#333333']
    ];
    const palette = colors[Math.floor(Math.random() * colors.length)];
    
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, palette[0]);
    gradient.addColorStop(0.5, palette[1]);
    gradient.addColorStop(1, palette[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add some random geometric shapes
    ctx.globalAlpha = 0.1;
    for (let i = 0; i < 5; i++) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(
            Math.random() * canvas.width,
            Math.random() * canvas.height,
            Math.random() * 200 + 50,
            0, Math.PI * 2
        );
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    
    // Band name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(bandName, canvas.width / 2, 320);
    
    // Venue
    ctx.font = '36px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#cccccc';
    ctx.fillText('@ ' + venue, canvas.width / 2, 400);
    
    // Date
    const dateObj = new Date(dateStr + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
    });
    ctx.font = '32px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#f5a623';
    ctx.fillText(formattedDate, canvas.width / 2, 480);
    
    // Convert to blob and upload
    canvas.toBlob(async (blob) => {
        const file = new File([blob], 'demo-flyer.png', { type: 'image/png' });
        
        // Upload to Firebase Storage using the correct modular syntax
        const fileRef = window.storageRef(window.storage, `demo/${Date.now()}_demo-flyer.png`);
        
        try {
            const snapshot = await window.uploadBytes(fileRef, file);
            const url = await window.getDownloadURL(snapshot.ref);
            
            // Set the show graphic
            window.showGraphic = { name: 'demo-flyer.png', url: url };
            
            // Update the preview if element exists
            const preview = document.getElementById('graphicPreview');
            if (preview) {
                preview.innerHTML = `<img src="${url}" style="max-width:200px;max-height:200px;border-radius:8px;">`;
                preview.style.display = 'block';
            }
            
            console.log('Demo flyer uploaded:', url);
        } catch (error) {
            console.error('Error uploading demo flyer:', error);
        }
    }, 'image/png');
}

async function createGig() {
    // Require sign-in to create gigs
    if (!window.currentUser) {
        alert('Please sign in to create a gig');
        signInWithGoogleAndCheckProfile();
        return;
    }
    
    const btn = document.getElementById('createBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Creating...';
    
    try {
        // Gather all the data
        const gigData = {
            bandName: document.getElementById('bandName').value,
            venue: document.getElementById('venue').value,
            showDate: document.getElementById('showDate').value,
            loadIn: document.getElementById('loadIn').value,
            setTime: document.getElementById('setTime').value,
            setLength: document.getElementById('setLength').value,
            notes: document.getElementById('notes').value,
            rehearsalLocation: document.getElementById('rehearsalLocation').value,
            rehearsalsNeeded: document.getElementById('rehearsalCount').value,
            suggestedTimes: [],
            setlist: window.setlistSongs || [],
            streamingLink: document.getElementById('streamingLink')?.value || '',
            showGraphic: window.showGraphic || null,
            files: [],
            createdAt: window.serverTimestamp(),
            // User tracking
            creatorId: window.currentUser?.uid || null,
            creatorEmail: window.currentUser?.email || null,
            creatorName: window.currentUser?.displayName || null,
            responderIds: [], // Array of user IDs who have responded
            expectedResponders: parseInt(document.getElementById('bandMemberCount')?.value) || 4,
            // Band integration
            bandId: window.selectedBandForGig || null
        };
        
        // Gather rehearsal slots
        document.querySelectorAll('.rehearsal-slot').forEach(slot => {
            const date = slot.querySelector('.slot-date').value;
            const time = slot.querySelector('.slot-time').value;
            if (date && time) {
                gigData.suggestedTimes.push({ date, time, responses: [] });
            }
        });
        
        // Gather uploaded files (only successfully uploaded ones)
        if (window.uploadedFiles) {
            window.uploadedFiles.forEach(file => {
                if (file.status === 'uploaded' && file.url) {
                    gigData.files.push({
                        name: file.name,
                        type: file.type,
                        url: file.url
                    });
                }
            });
        }
        
        // Save to Firestore
        const docRef = await window.addDoc(window.collection(window.db, "gigs"), gigData);
        currentGigId = docRef.id;
        
        console.log("Gig created with ID:", currentGigId);
        
        // Notify band members if band was selected
        if (window.selectedBandForGig) {
            await notifyBandMembersOfGig(window.selectedBandForGig, currentGigId, gigData);
        }
        
        // Update share URL with /e/ path for rich previews
        const shareUrl = `${window.location.origin}/e/${currentGigId}`;
        document.getElementById('shareUrl').textContent = shareUrl;
        
        // Go to success screen
        document.getElementById('screen2b').classList.remove('active');
        goToScreen3();
        
    } catch (error) {
        console.error("Error creating gig:", error);
        alert("Error creating gig: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Create Gig →';
    }
}

function copyLink() {
    const url = document.getElementById('shareUrl').textContent;
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('copyBtn');
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
        }, 2000);
    });
}

function shareToMessages() {
    const url = document.getElementById('shareUrl').textContent;
    const bandName = document.getElementById('bandName').value;
    const venue = document.getElementById('venue').value;
    const text = `Hey! Mark your availability for ${bandName} @ ${venue}: ${url}`;
    
    // Try to open messages with pre-filled text
    window.open(`sms:&body=${encodeURIComponent(text)}`);
}

function startOver() {
    // Reset form
    document.getElementById('bandName').value = '';
    document.getElementById('venue').value = '';
    document.getElementById('showDate').value = '';
    document.getElementById('loadIn').value = '';
    document.getElementById('setTime').value = '';
    document.getElementById('notes').value = '';
    
    // Reset to home screen
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen0').classList.add('active');
}

async function startNewGig() {
    // Require sign-in to create gigs
    if (!window.currentUser) {
        alert('Please sign in to create a gig');
        signInWithGoogleAndCheckProfile();
        return;
    }
    
    // Go to gig creation screen
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen1').classList.add('active');
    
    // Reset selected band
    window.selectedBandForGig = null;
    
    // Load user's bands into dropdown
    await loadBandsForGigSelect();
    
    // If coming from a band, pre-select it
    if (window.selectedBandForGig) {
        document.getElementById('gigBandSelect').value = window.selectedBandForGig;
        onBandSelected();
    }
}

// Load bands into gig creation dropdown
async function loadBandsForGigSelect() {
    const select = document.getElementById('gigBandSelect');
    select.innerHTML = '<option value="">-- Select a band (optional) --</option>';
    
    if (!window.currentUser) return;
    
    try {
        // Get bands where user is leader
        const leaderQuery = query(
            collection(db, "bands"),
            where("leaderId", "==", window.currentUser.uid)
        );
        const leaderSnap = await getDocs(leaderQuery);
        
        leaderSnap.forEach(doc => {
            const band = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = band.name;
            select.appendChild(option);
        });
        
    } catch (error) {
        console.error("Error loading bands for gig:", error);
    }
}

// Handle band selection in gig creation
async function onBandSelected() {
    const select = document.getElementById('gigBandSelect');
    const bandId = select.value;
    
    if (bandId) {
        window.selectedBandForGig = bandId;
        // Auto-fill band name
        const selectedOption = select.options[select.selectedIndex];
        document.getElementById('bandName').value = selectedOption.textContent;
        
        // Check if band members have calendars connected
        await checkBandCalendarStatus(bandId);
    } else {
        window.selectedBandForGig = null;
        document.getElementById('suggestTimesSection').style.display = 'none';
    }
}
window.onBandSelected = onBandSelected;

// Check if band members have connected calendars
async function checkBandCalendarStatus(bandId) {
    const suggestSection = document.getElementById('suggestTimesSection');
    const helper = document.getElementById('suggestTimesHelper');
    
    try {
        // Get band members
        const membersQuery = query(
            collection(db, "bandMembers"),
            where("bandId", "==", bandId),
            where("status", "==", "accepted")
        );
        const membersSnap = await getDocs(membersQuery);
        
        // Store member info for later
        window.bandMembersInfo = [];
        let connectedCount = 0;
        let totalMembers = membersSnap.size;
        
        for (const memberDoc of membersSnap.docs) {
            const member = memberDoc.data();
            const memberInfo = { name: member.name, email: member.email, connected: false };
            if (member.userId) {
                const profileDoc = await getDoc(doc(db, "users", member.userId));
                if (profileDoc.exists() && profileDoc.data().calendarConnected) {
                    connectedCount++;
                    memberInfo.connected = true;
                    memberInfo.token = profileDoc.data().calendarToken;
                }
            }
            window.bandMembersInfo.push(memberInfo);
        }
        
        // Check if leader has calendar connected
        const bandDoc = await getDoc(doc(db, "bands", bandId));
        const band = bandDoc.data();
        window.currentBandInfo = band;
        
        if (band.leaderId) {
            const leaderProfile = await getDoc(doc(db, "users", band.leaderId));
            const leaderInfo = { name: band.leaderName, email: band.leaderEmail, connected: false, isLeader: true };
            if (leaderProfile.exists() && leaderProfile.data().calendarConnected) {
                connectedCount++;
                leaderInfo.connected = true;
                leaderInfo.token = leaderProfile.data().calendarToken;
            }
            window.bandMembersInfo.unshift(leaderInfo);
            totalMembers++;
        }
        
        window.calendarConnectedCount = connectedCount;
        window.calendarTotalMembers = totalMembers;
        
        suggestSection.style.display = 'block';
        
        if (connectedCount === 0) {
            helper.textContent = `No members have connected calendars yet`;
            helper.innerHTML += '<br><a href="#" onclick="showEditProfile(); return false;" style="color: #4a90e2;">Connect yours →</a>';
        } else {
            helper.textContent = `${connectedCount} of ${totalMembers} members have calendars connected`;
        }
        
    } catch (error) {
        console.error("Error checking calendar status:", error);
        suggestSection.style.display = 'none';
    }
}

// Availability Calendar State
window.availCalendarState = {
    currentMonth: new Date(),
    selectedTimes: [],
    busyData: {},
    showDate: null
};

// Open the availability calendar modal
async function openAvailabilityCalendar() {
    const bandId = window.selectedBandForGig;
    if (!bandId) return;
    
    // Get show date
    const showDateStr = document.getElementById('showDate').value;
    if (showDateStr) {
        window.availCalendarState.showDate = showDateStr;
        window.availCalendarState.currentMonth = new Date(showDateStr + 'T00:00:00');
        window.availCalendarState.currentMonth.setDate(1);
    } else {
        window.availCalendarState.currentMonth = new Date();
        window.availCalendarState.currentMonth.setDate(1);
    }
    
    // Reset state
    window.availCalendarState.selectedTimes = [];
    window.availCalendarState.busyData = {};
    
    // Show modal
    document.getElementById('availModalOverlay').classList.add('active');
    document.getElementById('availLoadingState').style.display = 'block';
    document.getElementById('availCalendarContent').style.display = 'none';
    
    const subtitle = document.getElementById('availModalSubtitle');
    subtitle.textContent = `Checking ${window.calendarConnectedCount} calendar${window.calendarConnectedCount !== 1 ? 's' : ''}...`;
    
    try {
        // Fetch busy times from cloud function
        const showDate = showDateStr || new Date().toISOString().split('T')[0];
        const response = await fetch(`https://us-central1-bandcal-89c81.cloudfunctions.net/getBandBusyTimes?bandId=${bandId}&showDate=${showDate}`);
        const data = await response.json();
        
        if (data.busyTimes) {
            window.availCalendarState.busyData = data.busyTimes;
            window.availCalendarState.memberNames = data.memberNames || [];
        }
        
        subtitle.textContent = `${window.calendarConnectedCount} of ${window.calendarTotalMembers} calendars connected`;
        
        // Show calendar
        document.getElementById('availLoadingState').style.display = 'none';
        document.getElementById('availCalendarContent').style.display = 'block';
        
        renderAvailCalendar();
        updateSelectedTimesDisplay();
        
    } catch (error) {
        console.error("Error fetching calendar data:", error);
        subtitle.textContent = 'Could not load calendars';
        document.getElementById('availLoadingState').innerHTML = '<p style="color: #f44336;">Error loading calendars. You can still add times manually.</p>';
    }
}
window.openAvailabilityCalendar = openAvailabilityCalendar;

// Close availability calendar modal
function closeAvailabilityCalendar() {
    document.getElementById('availModalOverlay').classList.remove('active');
}
window.closeAvailabilityCalendar = closeAvailabilityCalendar;

// Navigate months
function availPrevMonth() {
    window.availCalendarState.currentMonth.setMonth(window.availCalendarState.currentMonth.getMonth() - 1);
    renderAvailCalendar();
}
window.availPrevMonth = availPrevMonth;

function availNextMonth() {
    window.availCalendarState.currentMonth.setMonth(window.availCalendarState.currentMonth.getMonth() + 1);
    renderAvailCalendar();
}
window.availNextMonth = availNextMonth;

// Render the availability calendar
function renderAvailCalendar() {
    const state = window.availCalendarState;
    const month = state.currentMonth;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Update month label
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('availCalMonth').textContent = 
        `${monthNames[month.getMonth()]} ${month.getFullYear()}`;
    
    // Get first day and days in month
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const startPadding = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    
    // Build calendar HTML
    let html = '';
    
    // Empty cells for padding
    for (let i = 0; i < startPadding; i++) {
        html += '<div class="avail-cal-day empty"></div>';
    }
    
    // Days
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const date = new Date(dateStr + 'T00:00:00');
        const isPast = date < today;
        const isShowDate = dateStr === state.showDate;
        
        // Calculate availability for this day
        const availability = getDayAvailability(dateStr);
        
        let classes = 'avail-cal-day';
        if (isPast) classes += ' past';
        else if (availability === 'all') classes += ' all-free';
        else if (availability === 'some') classes += ' some-free';
        else if (availability === 'none') classes += ' conflicts';
        if (isShowDate) classes += ' show-date';
        
        const clickHandler = isPast ? '' : `onclick="onAvailDayClick('${dateStr}')"`;
        
        html += `<div class="${classes}" ${clickHandler}>${day}</div>`;
    }
    
    document.getElementById('availCalDays').innerHTML = html;
}

// Get availability status for a day
function getDayAvailability(dateStr) {
    const busyData = window.availCalendarState.busyData;
    if (!busyData || Object.keys(busyData).length === 0) return 'unknown';
    
    // Check how many members have conflicts on this day
    let membersWithConflicts = 0;
    let totalMembers = Object.keys(busyData).length;
    
    for (const memberId in busyData) {
        const memberBusy = busyData[memberId] || [];
        const hasConflict = memberBusy.some(busy => {
            const busyDate = busy.start.split('T')[0];
            return busyDate === dateStr;
        });
        if (hasConflict) membersWithConflicts++;
    }
    
    // If no one has conflicts, all free
    if (membersWithConflicts === 0) return 'all';
    // If everyone has conflicts, none free
    if (membersWithConflicts === totalMembers) return 'none';
    // Otherwise, some free
    return 'some';
}

// Handle day click - show time slots
function onAvailDayClick(dateStr) {
    const panel = document.getElementById('availTimesPanel');
    panel.classList.add('active');
    
    // Format date for display
    const date = new Date(dateStr + 'T00:00:00');
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    document.getElementById('availTimesDate').textContent = date.toLocaleDateString('en-US', options);
    
    // Generate time slots for this day
    renderTimeSlots(dateStr);
}
window.onAvailDayClick = onAvailDayClick;

// Render time slots for a specific day
function renderTimeSlots(dateStr) {
    const container = document.getElementById('availTimeSlots');
    const busyData = window.availCalendarState.busyData;
    const memberNames = window.availCalendarState.memberNames || [];
    
    // Generate slots from 9am to 10pm
    const slots = [];
    for (let hour = 9; hour <= 22; hour++) {
        const timeStr = `${String(hour).padStart(2, '0')}:00`;
        const slotStart = new Date(`${dateStr}T${timeStr}:00`);
        const slotEnd = new Date(slotStart);
        slotEnd.setHours(slotEnd.getHours() + 2);
        
        // Check who's free for this slot
        const freeMembers = [];
        const busyMembers = [];
        
        let memberIndex = 0;
        for (const memberId in busyData) {
            const memberBusy = busyData[memberId] || [];
            const memberName = memberNames[memberIndex] || `Member ${memberIndex + 1}`;
            
            const isBusy = memberBusy.some(busy => {
                const busyStart = new Date(busy.start);
                const busyEnd = new Date(busy.end);
                return slotStart < busyEnd && slotEnd > busyStart;
            });
            
            if (isBusy) {
                busyMembers.push(memberName);
            } else {
                freeMembers.push(memberName);
            }
            memberIndex++;
        }
        
        // Determine if this is a suggested time (evening/weekend)
        const dayOfWeek = slotStart.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isEvening = hour >= 18 && hour <= 20;
        const isSuggested = (isWeekend && hour >= 10 && hour <= 18) || isEvening;
        
        slots.push({
            date: dateStr,
            time: timeStr,
            hour,
            freeMembers,
            busyMembers,
            isSuggested,
            allFree: busyMembers.length === 0
        });
    }
    
    // Sort: all free first, then suggested, then by time
    slots.sort((a, b) => {
        if (a.allFree && !b.allFree) return -1;
        if (!a.allFree && b.allFree) return 1;
        if (a.isSuggested && !b.isSuggested) return -1;
        if (!a.isSuggested && b.isSuggested) return 1;
        return a.hour - b.hour;
    });
    
    // Render
    let html = '';
    for (const slot of slots) {
        const isSelected = window.availCalendarState.selectedTimes.some(
            t => t.date === slot.date && t.time === slot.time
        );
        
        const hourDisplay = slot.hour > 12 ? slot.hour - 12 : slot.hour;
        const ampm = slot.hour >= 12 ? 'PM' : 'AM';
        
        let freeText = '';
        if (Object.keys(busyData).length > 0) {
            if (slot.allFree) {
                freeText = 'Everyone free';
            } else if (slot.freeMembers.length > 0) {
                freeText = `${slot.freeMembers.length} free: ${slot.freeMembers.join(', ')}`;
            } else {
                freeText = 'No one free';
            }
        }
        
        html += `
            <div class="avail-time-slot ${slot.isSuggested ? 'suggested' : ''} ${isSelected ? 'added' : ''}" 
                 onclick="toggleTimeSlot('${slot.date}', '${slot.time}')">
                <div class="avail-time-info">
                    <div class="avail-time-label">
                        ${hourDisplay}:00 ${ampm}
                        ${slot.isSuggested ? '<span class="avail-time-badge">⭐ Suggested</span>' : ''}
                    </div>
                    ${freeText ? `<div class="avail-time-members">${freeText}</div>` : ''}
                </div>
                <span class="avail-time-add">${isSelected ? '✓' : '+'}</span>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// Close times panel
function closeTimesPanel() {
    document.getElementById('availTimesPanel').classList.remove('active');
}
window.closeTimesPanel = closeTimesPanel;

// Toggle time slot selection
function toggleTimeSlot(date, time) {
    const state = window.availCalendarState;
    const existing = state.selectedTimes.findIndex(t => t.date === date && t.time === time);
    
    if (existing >= 0) {
        state.selectedTimes.splice(existing, 1);
    } else {
        state.selectedTimes.push({ date, time });
    }
    
    // Re-render current day's slots
    renderTimeSlots(date);
    updateSelectedTimesDisplay();
}
window.toggleTimeSlot = toggleTimeSlot;

// Update selected times display
function updateSelectedTimesDisplay() {
    const container = document.getElementById('availSelectedTimes');
    const list = document.getElementById('availSelectedList');
    const times = window.availCalendarState.selectedTimes;
    
    if (times.length === 0) {
        container.style.display = 'none';
        document.getElementById('applyTimesBtn').textContent = 'Add Selected Times';
        return;
    }
    
    container.style.display = 'block';
    document.getElementById('applyTimesBtn').textContent = `Add ${times.length} Time${times.length !== 1 ? 's' : ''}`;
    
    // Sort by date then time
    times.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
    });
    
    let html = '';
    for (const t of times) {
        const date = new Date(t.date + 'T00:00:00');
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const hour = parseInt(t.time.split(':')[0]);
        const hourDisplay = hour > 12 ? hour - 12 : hour;
        const ampm = hour >= 12 ? 'PM' : 'AM';
        
        html += `
            <div class="avail-selected-chip">
                ${dateStr} ${hourDisplay}${ampm}
                <button onclick="removeSelectedTime('${t.date}', '${t.time}')">&times;</button>
            </div>
        `;
    }
    
    list.innerHTML = html;
}

// Remove a selected time
function removeSelectedTime(date, time) {
    toggleTimeSlot(date, time);
}
window.removeSelectedTime = removeSelectedTime;

// Apply selected times to rehearsal slots
function applySelectedTimes() {
    const times = window.availCalendarState.selectedTimes;
    
    if (times.length === 0) {
        alert('Please select at least one time');
        return;
    }
    
    // Clear existing slots and add new ones
    const container = document.getElementById('rehearsalSlots');
    container.innerHTML = '';
    
    times.forEach((slot, index) => {
        const slotHtml = `
            <div class="rehearsal-slot" data-slot="${index + 1}">
                <div class="rehearsal-slot-header">
                    <span class="rehearsal-number">Option ${index + 1}</span>
                    <span class="remove-rehearsal" onclick="removeSlot(this)">Remove</span>
                </div>
                <div class="row">
                    <input type="date" class="slot-date" value="${slot.date}" min="2024-01-01" max="2099-12-31">
                    <input type="time" class="slot-time" value="${slot.time}">
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', slotHtml);
    });
    
    closeAvailabilityCalendar();
}
window.applySelectedTimes = applySelectedTimes;

// Sign in and update gig with user info (for band leaders)
async function signInAndSaveGig() {
    const user = await window.signInWithGoogle();
    if (!user || !window.currentGigId) return;
    
    try {
        // Update the gig with user info
        const gigRef = window.doc(window.db, "gigs", window.currentGigId);
        await window.updateDoc(gigRef, {
            creatorId: user.uid,
            creatorEmail: user.email,
            creatorName: user.displayName
        });
        
        // Hide the sign-in prompt
        const prompt = document.getElementById('signInPromptScreen3');
        if (prompt) prompt.style.display = 'none';
        
        // Show success message
        alert('Signed in! You\'ll get notified when your band responds.');
    } catch (error) {
        console.error('Error updating gig:', error);
    }
}

// Sign in and save response (for musicians)
async function signInAndSaveResponse() {
    const user = await window.signInWithGoogle();
    if (!user || !window.currentGigId) return;
    
    try {
        // Add user to responderIds
        const gigRef = window.doc(window.db, "gigs", window.currentGigId);
        const gigSnap = await window.getDoc(gigRef);
        const gig = gigSnap.data();
        
        let responderIds = gig.responderIds || [];
        if (!responderIds.includes(user.uid)) {
            responderIds.push(user.uid);
            await window.updateDoc(gigRef, { responderIds });
        }
        
        // Hide the sign-in prompt
        const prompt = document.getElementById('signInPromptMusician');
        if (prompt) prompt.style.display = 'none';
        
        alert('Signed in! This gig is now saved to your dashboard.');
    } catch (error) {
        console.error('Error saving response:', error);
    }
}

async function showMyGigs() {
    if (!window.currentUser) {
        const user = await window.signInWithGoogle();
        if (!user) return;
    }
    
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screenMyGigs').classList.add('active');
    
    // Update user info on this screen too
    const userInfo = document.getElementById('userInfoMyGigs');
    if (userInfo && window.currentUser) {
        const photoURL = window.currentUserProfile?.photoURL || window.currentUser.photoURL || '';
        const displayName = window.currentUserProfile?.name || window.currentUser.displayName || window.currentUser.email;
        userInfo.innerHTML = `
            <img src="${photoURL}" class="user-avatar" onerror="this.style.display='none'">
            <span class="user-name">${displayName}</span>
            <button class="sign-out-btn" onclick="signOutUser()">Sign Out</button>
        `;
        userInfo.style.display = 'flex';
    }
    
    await loadMyGigs();
}

async function loadMyGigs() {
    const container = document.getElementById('myGigsList');
    container.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';
    
    try {
        const userId = window.currentUser.uid;
        
        // Query gigs where user is the creator
        const createdQuery = window.query(
            window.collection(window.db, "gigs"),
            window.where("creatorId", "==", userId)
        );
        const createdSnap = await window.getDocs(createdQuery);
        
        // Query gigs where user is a responder
        const respondedQuery = window.query(
            window.collection(window.db, "gigs"),
            window.where("responderIds", "array-contains", userId)
        );
        const respondedSnap = await window.getDocs(respondedQuery);
        
        // Combine and dedupe
        const gigsMap = new Map();
        
        createdSnap.forEach(doc => {
            gigsMap.set(doc.id, { id: doc.id, ...doc.data(), role: 'leader' });
        });
        
        respondedSnap.forEach(doc => {
            if (!gigsMap.has(doc.id)) {
                gigsMap.set(doc.id, { id: doc.id, ...doc.data(), role: 'musician' });
            }
        });
        
        const gigs = Array.from(gigsMap.values());
        
        // Separate upcoming and past gigs
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const upcomingGigs = gigs.filter(gig => new Date(gig.showDate + 'T00:00:00') >= today);
        const pastGigs = gigs.filter(gig => new Date(gig.showDate + 'T00:00:00') < today);
        
        // Sort upcoming by date ascending (nearest first)
        upcomingGigs.sort((a, b) => new Date(a.showDate) - new Date(b.showDate));
        
        // Sort past by date descending (most recent first)
        pastGigs.sort((a, b) => new Date(b.showDate) - new Date(a.showDate));
        
        if (gigs.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🎵</div>
                    <p>No gigs yet!</p>
                    <p style="font-size: 13px; margin-top: 8px;">Create your first gig to get started.</p>
                </div>
            `;
            return;
        }
        
        // Helper function to render a gig card
        function renderGigCard(gig, isPast) {
            const showDate = new Date(gig.showDate + 'T00:00:00');
            const dateStr = showDate.toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
            });
            
            const confirmedTimes = gig.confirmedTimes || [];
            const hasConfirmed = confirmedTimes.length > 0;
            
            let confirmedHtml = '';
            if (isPast) {
                confirmedHtml = `<div class="my-gig-past-badge">Completed</div>`;
            } else if (hasConfirmed) {
                confirmedHtml = `
                    <div class="my-gig-confirmed">
                        <div class="my-gig-confirmed-label">✓ Confirmed Rehearsals</div>
                        ${confirmedTimes.map(slot => {
                            const rDate = new Date(slot.date + 'T00:00:00');
                            const rDateStr = rDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                            const timeStr = new Date('2000-01-01T' + slot.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                            return `<div class="my-gig-rehearsal">${rDateStr} · ${timeStr}</div>`;
                        }).join('')}
                    </div>
                `;
            } else {
                const responseCount = new Set();
                (gig.suggestedTimes || []).forEach(slot => {
                    (slot.responses || []).forEach(r => responseCount.add(r.name.toLowerCase()));
                });
                const expected = gig.expectedResponders || 4;
                confirmedHtml = `
                    <div class="my-gig-pending">
                        ⏳ Waiting for responses (${responseCount.size}/${expected})
                    </div>
                `;
            }
            
            return `
                <div class="my-gig-card ${isPast ? 'past' : ''}" onclick="openGig('${gig.id}', '${gig.role}')">
                    <div class="my-gig-header">
                        <div>
                            <div class="my-gig-band">${gig.bandName || 'Untitled'}</div>
                            <div class="my-gig-venue">${gig.venue || ''}</div>
                        </div>
                        <span class="my-gig-role ${gig.role}">${gig.role === 'leader' ? '👑' : '🎵'}</span>
                    </div>
                    <div class="my-gig-date">🎤 Show: ${dateStr}</div>
                    ${confirmedHtml}
                </div>
            `;
        }
        
        // Build HTML
        let html = '';
        
        // Upcoming section
        if (upcomingGigs.length > 0) {
            html += `<div class="my-gigs-section-label">Upcoming</div>`;
            html += upcomingGigs.map(gig => renderGigCard(gig, false)).join('');
        } else {
            html += `<div class="my-gigs-empty-upcoming">No upcoming gigs</div>`;
        }
        
        // Past section (collapsible)
        if (pastGigs.length > 0) {
            html += `
                <div class="my-gigs-past-header" onclick="togglePastGigs()">
                    <span>Past Gigs (${pastGigs.length})</span>
                    <span id="pastGigsArrow">▼</span>
                </div>
                <div id="pastGigsList" class="my-gigs-past-list" style="display: none;">
                    ${pastGigs.map(gig => renderGigCard(gig, true)).join('')}
                </div>
            `;
        }
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error("Error loading gigs:", error);
        container.innerHTML = `
            <div class="empty-state">
                <p>Error loading gigs</p>
                <p style="font-size: 13px; margin-top: 8px;">${error.message}</p>
            </div>
        `;
    }
}

function openGig(gigId, role) {
    if (role === 'leader') {
        window.currentGigId = gigId;
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('screen6').classList.add('active');
        loadDashboard(gigId);
    } else {
        // Musician view - show their confirmed rehearsals
        loadMusicianGigView(gigId);
    }
}

function togglePastGigs() {
    const list = document.getElementById('pastGigsList');
    const arrow = document.getElementById('pastGigsArrow');
    if (list.style.display === 'none') {
        list.style.display = 'flex';
        arrow.textContent = '▲';
    } else {
        list.style.display = 'none';
        arrow.textContent = '▼';
    }
}

async function loadMusicianGigView(gigId) {
    try {
        const gigRef = window.doc(window.db, "gigs", gigId);
        const gigSnap = await window.getDoc(gigRef);
        
        if (!gigSnap.exists()) {
            alert("Gig not found!");
            return;
        }
        
        const gig = gigSnap.data();
        window.currentGigId = gigId;
        
        // If there are confirmed times, show the event card view
        if (gig.confirmedTimes && gig.confirmedTimes.length > 0) {
            loadEventCard(gigId);
        } else {
            // Otherwise show the availability submission view
            loadGig(gigId);
        }
    } catch (error) {
        console.error("Error loading gig:", error);
        alert("Error loading gig");
    }
}

function viewDashboard() {
    document.getElementById('screen3').classList.remove('active');
    document.getElementById('screen6').classList.add('active');
    loadDashboard(currentGigId);
}

async function loadDashboard(gigId) {
    try {
        const gigRef = window.doc(window.db, "gigs", gigId);
        const gigSnap = await window.getDoc(gigRef);
        
        if (!gigSnap.exists()) {
            alert("Gig not found!");
            return;
        }
        
        const gig = gigSnap.data();
        window.currentGig = gig;
        window.currentGigId = gigId;
        
        // Update header
        document.getElementById('dashBand').textContent = gig.bandName;
        document.getElementById('dashVenue').textContent = gig.venue;
        document.getElementById('dashDate').textContent = formatDate(gig.showDate);
        
        // Update share URL with /e/ path for rich previews
        document.getElementById('dashShareUrl').textContent = `${window.location.origin}/e/${gigId}`;
        
        // Collect all unique responders
        const allResponders = new Map();
        gig.suggestedTimes.forEach(slot => {
            (slot.responses || []).forEach(r => {
                if (!allResponders.has(r.name)) {
                    allResponders.set(r.name, { name: r.name, instrument: r.instrument, times: 0 });
                }
                allResponders.get(r.name).times++;
            });
        });
        
        // Update response count
        document.getElementById('responseCount').textContent = `${allResponders.size} response${allResponders.size !== 1 ? 's' : ''}`;
        document.getElementById('neededCount').textContent = `Need ${gig.rehearsalsNeeded}`;
        
        // Build members list
        const membersList = document.getElementById('membersList');
        if (allResponders.size === 0) {
            membersList.innerHTML = '<p class="empty-state">No responses yet. Share the link with your band!</p>';
        } else {
            membersList.innerHTML = '';
            allResponders.forEach(member => {
                const memberEl = document.createElement('div');
                memberEl.className = 'member-item';
                memberEl.innerHTML = `
                    <div class="member-avatar">${member.name.charAt(0).toUpperCase()}</div>
                    <div class="member-info">
                        <div class="member-name">${member.name}</div>
                        <div class="member-instrument">${member.instrument}</div>
                    </div>
                    <div class="member-times">${member.times} time${member.times !== 1 ? 's' : ''}</div>
                `;
                membersList.appendChild(memberEl);
            });
        }
        
        // Check for confirmed rehearsals
        const confirmedTimes = gig.confirmedTimes || [];
        
        if (confirmedTimes.length > 0) {
            // Show confirmed rehearsals, hide share bar
            document.getElementById('confirmedCard').style.display = 'block';
            document.getElementById('howToConfirm').style.display = 'none';
            document.querySelector('.share-bar').style.display = 'none';
            const confirmedList = document.getElementById('confirmedList');
            confirmedList.innerHTML = '';
            confirmedTimes.forEach(slot => {
                const el = document.createElement('div');
                el.className = 'confirmed-item';
                el.innerHTML = `<span class="confirmed-datetime">${formatDate(slot.date)} · ${formatTime(slot.time)}</span><span class="confirmed-badge">Confirmed</span>`;
                confirmedList.appendChild(el);
            });
        } else {
            document.getElementById('confirmedCard').style.display = 'none';
            document.getElementById('howToConfirm').style.display = 'block';
            document.querySelector('.share-bar').style.display = 'flex';
        }
        
        // Build time slots
        const slotsContainer = document.getElementById('dashboardSlots');
        slotsContainer.innerHTML = '';
        
        gig.suggestedTimes.forEach((slot, index) => {
            const responses = slot.responses || [];
            const isConfirmed = confirmedTimes.some(c => c.date === slot.date && c.time === slot.time);
            
            const slotEl = document.createElement('div');
            slotEl.className = 'dashboard-slot' + (isConfirmed ? ' confirmed selected' : '');
            slotEl.dataset.index = index;
            
            if (!isConfirmed) {
                slotEl.onclick = function() { toggleDashboardSlot(this); };
            }
            
            const everyoneAvailable = allResponders.size > 0 && responses.length === allResponders.size;
            
            const attendeesHtml = responses.length > 0
                ? responses.map(r => `<span class="attendee-chip available">${r.name}</span>`).join('')
                : '<span class="attendee-chip">No responses yet</span>';
            
            slotEl.innerHTML = `
                <div class="slot-header">
                    <span class="slot-datetime">${formatDate(slot.date)} · ${formatTime(slot.time)}</span>
                    <span class="slot-count ${everyoneAvailable ? 'everyone' : ''}">${responses.length}/${allResponders.size} available</span>
                </div>
                <div class="slot-attendees">${attendeesHtml}</div>
            `;
            slotsContainer.appendChild(slotEl);
        });
        
        updateConfirmSection();
        
    } catch (error) {
        console.error("Error loading dashboard:", error);
        alert("Error loading dashboard: " + error.message);
    }
}

function toggleDashboardSlot(element) {
    element.classList.toggle('selected');
    updateConfirmSection();
}

function updateConfirmSection() {
    const selected = document.querySelectorAll('.dashboard-slot.selected:not(.confirmed)');
    const confirmSection = document.getElementById('confirmSection');
    const confirmSummary = document.getElementById('confirmSummary');
    
    if (selected.length > 0) {
        confirmSection.style.display = 'block';
        confirmSummary.textContent = `${selected.length} rehearsal${selected.length !== 1 ? 's' : ''} selected`;
    } else {
        confirmSection.style.display = 'none';
    }
}

async function confirmRehearsals() {
    const selected = document.querySelectorAll('.dashboard-slot.selected:not(.confirmed)');
    if (selected.length === 0) return;
    
    const btn = document.getElementById('confirmBtn');
    btn.disabled = true;
    btn.textContent = 'Confirming...';
    
    try {
        const gig = window.currentGig;
        const confirmedTimes = gig.confirmedTimes || [];
        
        selected.forEach(slotEl => {
            const index = parseInt(slotEl.dataset.index);
            const slot = gig.suggestedTimes[index];
            confirmedTimes.push({ date: slot.date, time: slot.time });
        });
        
        // Save to Firestore
        const gigRef = window.doc(window.db, "gigs", window.currentGigId);
        await window.updateDoc(gigRef, { confirmedTimes: confirmedTimes });
        
        // Send notification emails to all musicians who responded
        const respondersEmails = new Set();
        (gig.suggestedTimes || []).forEach(slot => {
            (slot.responses || []).forEach(r => {
                if (r.email) respondersEmails.add(r.email);
            });
        });
        
        // Also check responderIds to get emails from signed-in users
        if (gig.responderIds && gig.responderIds.length > 0) {
            // We'll send to responder emails stored in the gig
            // For now, create notifications for each unique responder
        }
        
        // Get unique responder names to notify (we may not have emails for unsigned users)
        const responderNames = new Set();
        (gig.suggestedTimes || []).forEach(slot => {
            (slot.responses || []).forEach(r => {
                responderNames.add(r.name);
            });
        });
        
        // Create notification for each responder who has an email stored
        // For signed-in users, we can look up their email
        // For now, we'll create a batch notification that the Cloud Function can process
        try {
            await window.addDoc(window.collection(window.db, "notifications"), {
                type: 'rehearsals_confirmed',
                gigId: window.currentGigId,
                bandName: gig.bandName,
                venue: gig.venue,
                rehearsalLocation: gig.rehearsalLocation,
                confirmedTimes: confirmedTimes,
                responderIds: gig.responderIds || [],
                createdAt: window.serverTimestamp(),
                sent: false,
                // We'll need to send to multiple people - the Cloud Function will handle this
                notifyAll: true
            });
            console.log("Confirmation notifications queued");
        } catch (notifError) {
            console.error("Error queuing notifications:", notifError);
        }
        
        // Reload dashboard
        await loadDashboard(window.currentGigId);
        
    } catch (error) {
        console.error("Error confirming:", error);
        alert("Error confirming: " + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirm Rehearsals';
    }
}

function refreshDashboard() {
    loadDashboard(window.currentGigId);
}

function copyDashLink() {
    const url = document.getElementById('dashShareUrl').textContent;
    navigator.clipboard.writeText(url).then(() => {
        event.target.textContent = 'Copied!';
        setTimeout(() => { event.target.textContent = 'Copy Link'; }, 2000);
    });
}

function backToShare() {
    document.getElementById('screen6').classList.remove('active');
    document.getElementById('screen3').classList.add('active');
}

// Edit gig functionality
window.editSetlistSongs = [];
window.editUploadedFiles = [];

function editGig() {
    const gig = window.currentGig;
    if (!gig) return;
    
    // Populate edit form with current values
    document.getElementById('editBandName').value = gig.bandName || '';
    document.getElementById('editVenue').value = gig.venue || '';
    document.getElementById('editShowDate').value = gig.showDate || '';
    document.getElementById('editLoadIn').value = gig.loadIn || '';
    document.getElementById('editSetTime').value = gig.setTime || '';
    document.getElementById('editSetLength').value = gig.setLength || '45';
    document.getElementById('editNotes').value = gig.notes || '';
    document.getElementById('editRehearsalLocation').value = gig.rehearsalLocation || '';
    document.getElementById('editStreamingLink').value = gig.streamingLink || '';
    
    // Load setlist
    window.editSetlistSongs = [...(gig.setlist || [])];
    renderEditSetlist();
    
    // Load existing files
    window.editUploadedFiles = (gig.files || []).map(f => ({
        ...f,
        status: 'existing'
    }));
    renderEditFiles();
    
    // Show edit screen
    document.getElementById('screen6').classList.remove('active');
    document.getElementById('screen8').classList.add('active');
}

function cancelEdit() {
    document.getElementById('screen8').classList.remove('active');
    document.getElementById('screen6').classList.add('active');
}

function addEditSong() {
    const titleInput = document.getElementById('editNewSongTitle');
    const durationInput = document.getElementById('editNewSongDuration');
    
    const title = titleInput.value.trim();
    if (!title) return;
    
    window.editSetlistSongs.push({ title, duration: durationInput.value.trim(), files: [] });
    renderEditSetlist();
    
    titleInput.value = '';
    durationInput.value = '';
}

function removeEditSong(index) {
    window.editSetlistSongs.splice(index, 1);
    renderEditSetlist();
}

function renderEditSetlist() {
    const container = document.getElementById('editSetlistItems');
    container.innerHTML = '';
    
    window.editSetlistSongs.forEach((song, index) => {
        const el = document.createElement('div');
        el.className = 'setlist-item-expanded';
        
        const filesHtml = (song.files || []).map((file, fileIndex) => `
            <div class="song-file">
                <span class="song-file-icon">${file.type === 'audio' ? '🎵' : '📄'}</span>
                <span class="song-file-name">${file.name}</span>
                <span class="song-file-remove" onclick="removeEditSongFile(${index}, ${fileIndex})">×</span>
            </div>
        `).join('');
        
        el.innerHTML = `
            <div class="setlist-item-header">
                <div class="setlist-number">${index + 1}</div>
                <div class="setlist-info">
                    <div class="setlist-title">${song.title}</div>
                    ${song.duration ? `<div class="setlist-duration">${song.duration}</div>` : ''}
                </div>
                <span class="setlist-remove" onclick="removeEditSong(${index})">×</span>
            </div>
            <div class="song-files-section">
                ${filesHtml}
                <label class="song-file-upload" onclick="document.getElementById('editSongFileInput-${index}').click()">
                    + Add audio or chart
                </label>
                <input type="file" id="editSongFileInput-${index}" accept="audio/*,.pdf" style="display:none" onchange="handleEditSongFileSelect(event, ${index})">
            </div>
        `;
        container.appendChild(el);
    });
}

async function handleEditSongFileSelect(event, songIndex) {
    const file = event.target.files[0];
    if (!file) return;
    
    const song = window.editSetlistSongs[songIndex];
    if (!song.files) song.files = [];
    
    const fileData = {
        name: file.name,
        type: file.type.startsWith('audio/') ? 'audio' : 'pdf',
        status: 'uploading',
        url: null
    };
    song.files.push(fileData);
    renderEditSetlist();
    
    try {
        const storageRef = window.storageRef(window.storage, `gigs/songs/${Date.now()}_${file.name}`);
        const snapshot = await window.uploadBytes(storageRef, file);
        const url = await window.getDownloadURL(snapshot.ref);
        
        fileData.url = url;
        fileData.status = 'uploaded';
        renderEditSetlist();
    } catch (error) {
        console.error('Upload error:', error);
        song.files = song.files.filter(f => f !== fileData);
        renderEditSetlist();
        alert('Error uploading file: ' + error.message);
    }
    
    event.target.value = '';
}

function removeEditSongFile(songIndex, fileIndex) {
    window.editSetlistSongs[songIndex].files.splice(fileIndex, 1);
    renderEditSetlist();
}

function removeEditFile(index) {
    window.editUploadedFiles.splice(index, 1);
    renderEditFiles();
}

function renderEditFiles() {
    const container = document.getElementById('editExistingFiles');
    container.innerHTML = '';
    
    window.editUploadedFiles.forEach((file, index) => {
        let icon = '📄';
        if (file.type === 'image') icon = '🖼';
        else if (file.type === 'audio') icon = '🎵';
        else if (file.type === 'pdf') icon = '📑';
        
        const el = document.createElement('div');
        el.className = 'uploaded-file';
        el.innerHTML = `
            <div class="uploaded-file-icon">${icon}</div>
            <div class="uploaded-file-info">
                <div class="uploaded-file-name">${file.name}</div>
                <div class="uploaded-file-size">${file.status === 'existing' ? 'Saved' : file.status === 'uploading' ? 'Uploading...' : 'Ready'}</div>
            </div>
            <span class="uploaded-file-remove" onclick="removeEditFile(${index})">×</span>
        `;
        container.appendChild(el);
    });
}

async function handleEditFileSelect(event) {
    const files = event.target.files;
    if (!files.length) return;
    
    for (const file of files) {
        const fileData = {
            name: file.name,
            type: getFileType(file),
            file: file,
            status: 'uploading',
            url: null
        };
        
        window.editUploadedFiles.push(fileData);
        renderEditFiles();
        
        try {
            const storageRef = window.storageRef(window.storage, `gigs/${Date.now()}_${file.name}`);
            const snapshot = await window.uploadBytes(storageRef, file);
            const url = await window.getDownloadURL(snapshot.ref);
            
            fileData.url = url;
            fileData.status = 'uploaded';
            renderEditFiles();
        } catch (error) {
            console.error('Upload error:', error);
            fileData.status = 'error';
            renderEditFiles();
        }
    }
    
    event.target.value = '';
}

async function saveGigEdits() {
    const btn = document.querySelector('#screen8 .btn-primary');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    
    try {
        const updatedData = {
            bandName: document.getElementById('editBandName').value,
            venue: document.getElementById('editVenue').value,
            showDate: document.getElementById('editShowDate').value,
            loadIn: document.getElementById('editLoadIn').value,
            setTime: document.getElementById('editSetTime').value,
            setLength: document.getElementById('editSetLength').value,
            notes: document.getElementById('editNotes').value,
            rehearsalLocation: document.getElementById('editRehearsalLocation').value,
            streamingLink: document.getElementById('editStreamingLink').value,
            setlist: window.editSetlistSongs,
            files: window.editUploadedFiles.filter(f => f.url).map(f => ({
                name: f.name,
                type: f.type,
                url: f.url
            }))
        };
        
        const gigRef = window.doc(window.db, "gigs", window.currentGigId);
        await window.updateDoc(gigRef, updatedData);
        
        // Update local gig data
        Object.assign(window.currentGig, updatedData);
        
        // Go back to dashboard and refresh
        document.getElementById('screen8').classList.remove('active');
        document.getElementById('screen6').classList.add('active');
        loadDashboard(window.currentGigId);
        
    } catch (error) {
        console.error('Error saving:', error);
        alert('Error saving changes: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Changes';
    }
}

function shareConfirmedDetails() {
    const gig = window.currentGig;
    if (!gig) return;
    
    const btn = document.getElementById('shareToGroupBtn');
    
    // Generate event card link with /e/ path for rich previews
    const eventUrl = `${window.location.origin}/e/${window.currentGigId}`;
    
    // Copy the link and show feedback
    navigator.clipboard.writeText(eventUrl).then(() => {
        btn.innerHTML = '✓ Link Copied!';
        btn.style.background = 'rgba(80, 200, 80, 0.2)';
        btn.style.borderColor = 'rgba(80, 200, 80, 0.4)';
        
        setTimeout(() => {
            btn.innerHTML = '📤 Share to Group Chat';
            btn.style.background = '';
            btn.style.borderColor = '';
        }, 2500);
    }).catch(() => {
        prompt('Copy this link to share:', eventUrl);
    });
}

function copyToClipboardAndNotify(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Copied to clipboard!');
    }).catch(() => {
        prompt('Copy this:', text);
    });
}

async function loadEventCard(gigId) {
    try {
        const gigRef = window.doc(window.db, "gigs", gigId);
        const gigSnap = await window.getDoc(gigRef);
        
        if (!gigSnap.exists()) {
            alert("Event not found!");
            return;
        }
        
        const gig = gigSnap.data();
        window.currentGig = gig;
        window.currentGigId = gigId;
        
        // Show graphic if available
        if (gig.showGraphic && gig.showGraphic.url) {
            document.getElementById('eventGraphic').src = gig.showGraphic.url;
            document.getElementById('eventGraphicSection').style.display = 'block';
        }
        
        // Populate event card
        document.getElementById('eventBand').textContent = gig.bandName;
        document.getElementById('eventVenue').textContent = gig.venue;
        document.getElementById('eventDate').textContent = formatDate(gig.showDate);
        document.getElementById('eventLoadIn').textContent = formatTime(gig.loadIn) || '-';
        document.getElementById('eventSetTime').textContent = formatTime(gig.setTime) || '-';
        document.getElementById('eventSetLength').textContent = gig.setLength ? `${gig.setLength} min` : '-';
        
        // Confirmed rehearsals
        const confirmedTimes = gig.confirmedTimes || [];
        if (confirmedTimes.length > 0) {
            document.getElementById('eventRehearsalsSection').style.display = 'block';
            
            // Show rehearsal location if available
            if (gig.rehearsalLocation) {
                document.getElementById('eventRehearsalLocation').textContent = gig.rehearsalLocation;
                document.getElementById('eventRehearsalLocation').style.display = 'block';
            }
            
            const rehearsalsDiv = document.getElementById('eventRehearsals');
            rehearsalsDiv.innerHTML = '';
            confirmedTimes.forEach(slot => {
                const el = document.createElement('div');
                el.className = 'event-rehearsal';
                el.textContent = `${formatDate(slot.date)} @ ${formatTime(slot.time)}`;
                rehearsalsDiv.appendChild(el);
            });
        }
        
        // Setlist
        if (gig.setlist && gig.setlist.length > 0) {
            document.getElementById('eventSetlistSection').style.display = 'block';
            const setlistDiv = document.getElementById('eventSetlist');
            setlistDiv.innerHTML = '';
            gig.setlist.forEach((song, i) => {
                const el = document.createElement('div');
                el.className = 'event-setlist-item-expanded';
                
                // Build files HTML if song has files
                let filesHtml = '';
                if (song.files && song.files.length > 0) {
                    filesHtml = '<div class="event-song-files">';
                    song.files.forEach(file => {
                        if (file.type === 'audio' && file.url) {
                            filesHtml += `
                                <div class="event-song-audio">
                                    <audio controls src="${file.url}" crossorigin="anonymous" preload="metadata"></audio>
                                    <a class="audio-download-link" href="${file.url}" target="_blank">↓ Download</a>
                                </div>
                            `;
                        } else if (file.url) {
                            filesHtml += `
                                <a class="event-song-file-link" href="${file.url}" target="_blank">
                                    📄 ${file.name}
                                </a>
                            `;
                        }
                    });
                    filesHtml += '</div>';
                }
                
                el.innerHTML = `
                    <div class="event-song-header">
                        <span class="event-song-title">${i + 1}. ${song.title}</span>
                        <span class="event-song-duration">${song.duration || ''}</span>
                    </div>
                    ${filesHtml}
                `;
                setlistDiv.appendChild(el);
            });
            
            // Streaming link
            if (gig.streamingLink) {
                const streamLink = document.getElementById('eventStreamingLink');
                streamLink.href = gig.streamingLink;
                streamLink.style.display = 'flex';
            }
        }
        
        // Files
        if (gig.files && gig.files.length > 0) {
            document.getElementById('eventFilesSection').style.display = 'block';
            const filesDiv = document.getElementById('eventFiles');
            filesDiv.innerHTML = '';
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
                    const el = document.createElement('div');
                    el.className = 'event-file';
                    el.onclick = () => window.open(file.url, '_blank');
                    
                    let icon = '📄';
                    if (file.type === 'image') icon = '🖼';
                    else if (file.type === 'pdf') icon = '📑';
                    
                    el.innerHTML = `
                        <div class="event-file-icon">${icon}</div>
                        <div class="event-file-info">
                            <div class="event-file-name">${file.name}</div>
                            <div class="event-file-type">${file.type || 'File'}</div>
                        </div>
                    `;
                    filesDiv.appendChild(el);
                }
            });
        }
        
        // Notes
        if (gig.notes) {
            document.getElementById('eventNotesSection').style.display = 'block';
            document.getElementById('eventNotes').textContent = gig.notes;
        }
        
        // Show event card screen
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('screen7').classList.add('active');
        
    } catch (error) {
        console.error("Error loading event:", error);
        alert("Error loading event: " + error.message);
    }
}

function addToCalendar() {
    const gig = window.currentGig;
    if (!gig) return;
    
    // Create ICS file content
    const showDate = gig.showDate.replace(/-/g, '');
    const startTime = gig.loadIn ? gig.loadIn.replace(':', '') + '00' : '180000';
    const endTime = gig.setTime ? gig.setTime.replace(':', '') + '00' : '230000';
    
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:${showDate}T${startTime}
DTEND:${showDate}T${endTime}
SUMMARY:${gig.bandName} @ ${gig.venue}
DESCRIPTION:Load-in: ${formatTime(gig.loadIn) || 'TBD'}\\nSet time: ${formatTime(gig.setTime) || 'TBD'}\\nSet length: ${gig.setLength || 'TBD'} min
LOCATION:${gig.venue}
END:VEVENT
END:VCALENDAR`;
    
    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${gig.bandName}-${gig.venue}.ics`;
    a.click();
    URL.revokeObjectURL(url);
}

function toggleSlot(element) {
    element.classList.toggle('selected');
    updateSelectedSummary();
}

function renderCalendar() {
    const gig = window.currentGig;
    if (!gig) return;
    
    const showDate = new Date(gig.showDate + 'T00:00:00');
    const calDate = window.calendarDate;
    const year = calDate.getFullYear();
    const month = calDate.getMonth();
    
    // Update month label
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('calendarMonth').textContent = `${monthNames[month]} ${year}`;
    
    // Get first day of month and total days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    // Build calendar grid
    const calendarDays = document.getElementById('calendarDays');
    calendarDays.innerHTML = '';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Map suggested times by date and calculate response counts
    const slotsByDate = {};
    let maxResponses = 0;
    
    gig.suggestedTimes.forEach((slot, index) => {
        if (!slotsByDate[slot.date]) {
            slotsByDate[slot.date] = { slots: [], totalResponses: 0 };
        }
        slotsByDate[slot.date].slots.push({ ...slot, index });
        const responseCount = slot.responses?.length || 0;
        slotsByDate[slot.date].totalResponses += responseCount;
        if (responseCount > maxResponses) maxResponses = responseCount;
    });
    
    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day other-month';
        dayEl.textContent = daysInPrevMonth - i;
        calendarDays.appendChild(dayEl);
    }
    
    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const dayEl = document.createElement('div');
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const thisDate = new Date(year, month, day);
        
        let classes = ['calendar-day'];
        
        // Check if it's the show day
        if (thisDate.getTime() === showDate.getTime()) {
            classes.push('show-day');
            dayEl.innerHTML = `${day}<div style="font-size:8px;color:#f5a623;margin-top:2px;">SHOW</div>`;
        } else if (thisDate < today || thisDate >= showDate) {
            // Past or after show
            classes.push('past');
            dayEl.textContent = day;
        } else {
            // Selectable day
            classes.push('selectable');
            
            const dayData = slotsByDate[dateStr];
            const hasSuggestedSlots = dayData && dayData.slots.length > 0;
            
            // Check if ALL suggested times for this day are selected
            const allSuggestedSelected = hasSuggestedSlots && dayData.slots.every(slot => 
                window.selectedTimes.some(t => t.date === slot.date && t.time === slot.time)
            );
            
            // Check if user has any selections (suggested or custom) for this day
            const hasAnySuggestedSelection = window.selectedTimes.some(t => t.date === dateStr);
            const hasCustomSelection = window.customTimes.some(t => t.date === dateStr);
            
            if (hasSuggestedSlots) {
                // Day has suggested times - clicking toggles all of them
                dayEl.onclick = () => toggleDaySuggested(dateStr, dayData.slots);
                classes.push('has-slots');
                
                // Show checkmark if all suggested times are selected
                if (allSuggestedSelected) {
                    classes.push('has-selection');
                    dayEl.innerHTML = `<span>${day}</span><div class="day-check">✓</div>`;
                } else if (dayData.totalResponses > 0) {
                    dayEl.innerHTML = `<span>${day}</span><div class="day-response-count">${dayData.totalResponses}</div>`;
                } else {
                    dayEl.innerHTML = `${day}`;
                }
                
                // Also show checkmark if has custom times
                if (hasCustomSelection && !allSuggestedSelected) {
                    dayEl.innerHTML = `<span>${day}</span><div class="day-check">✓</div>`;
                    classes.push('has-selection');
                }
                
                // Create indicators container
                const indicators = document.createElement('div');
                indicators.className = 'slot-indicator';
                
                dayData.slots.forEach(slot => {
                    const dot = document.createElement('div');
                    const responseCount = slot.responses?.length || 0;
                    
                    if (responseCount > 0 && responseCount === maxResponses && maxResponses > 0) {
                        dot.className = 'slot-dot popular';
                    } else {
                        dot.className = 'slot-dot suggested';
                    }
                    indicators.appendChild(dot);
                });
                dayEl.appendChild(indicators);
            } else {
                // Day has no suggested times - clicking opens custom time picker for this day
                dayEl.onclick = () => selectDayForCustomTime(dateStr);
                dayEl.textContent = day;
                
                // Show if user has custom times for this day
                if (hasCustomSelection) {
                    classes.push('has-selection');
                    dayEl.innerHTML = `<span>${day}</span><div class="day-check">✓</div>`;
                }
            }
            
            // Check if this is the currently selected day (custom picker open)
            if (window.currentSelectedDay === dateStr) {
                classes.push('currently-selected');
            }
        }
        
        dayEl.className = classes.join(' ');
        calendarDays.appendChild(dayEl);
    }
    
    // Next month days
    const totalCells = firstDay + daysInMonth;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remainingCells; i++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day other-month';
        dayEl.textContent = i;
        calendarDays.appendChild(dayEl);
    }
}

function prevMonth() {
    window.calendarDate.setMonth(window.calendarDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    window.calendarDate.setMonth(window.calendarDate.getMonth() + 1);
    renderCalendar();
}

function selectDay(dateStr, dateObj) {
    window.currentSelectedDay = dateStr;
    
    // Re-render calendar to show selection
    renderCalendar();
    
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    document.getElementById('selectedDayTitle').textContent = dayName;
    
    // Build suggested times for this day
    const suggestedDiv = document.getElementById('suggestedTimesForDay');
    suggestedDiv.innerHTML = '';
    
    const gig = window.currentGig;
    const slotsForDay = gig.suggestedTimes.filter(s => s.date === dateStr);
    
    if (slotsForDay.length > 0) {
        const label = document.createElement('div');
        label.className = 'custom-time-label';
        label.textContent = 'Suggested times';
        label.style.marginBottom = '10px';
        label.style.marginTop = '0';
        suggestedDiv.appendChild(label);
        
        slotsForDay.forEach((slot, idx) => {
            const slotIndex = gig.suggestedTimes.findIndex(s => s.date === slot.date && s.time === slot.time);
            const isSelected = window.selectedTimes.some(t => t.date === slot.date && t.time === slot.time);
            
            const slotEl = document.createElement('div');
            slotEl.className = 'time-slot-option' + (isSelected ? ' selected' : '');
            slotEl.dataset.date = slot.date;
            slotEl.dataset.time = slot.time;
            slotEl.dataset.index = slotIndex;
            slotEl.onclick = () => toggleTimeSlot(slotEl);
            
            const responses = slot.responses || [];
            const responseHtml = responses.length > 0
                ? responses.map(r => `<span>${r.name}</span>`).join('')
                : '<span style="opacity:0.5;background:rgba(255,255,255,0.06);color:#666;">No responses yet</span>';
            
            slotEl.innerHTML = `
                <div class="time-slot-info">
                    <div class="time-slot-time">${formatTime(slot.time)}<span class="time-slot-badge">Suggested</span></div>
                    <div class="time-slot-responses">${responseHtml}</div>
                </div>
                <div class="time-slot-check">✓</div>
            `;
            suggestedDiv.appendChild(slotEl);
        });
    }
    
    // Show custom times for this day
    const customDiv = document.getElementById('customTimesForDay');
    customDiv.innerHTML = '';
    
    const customForDay = window.customTimes.filter(t => t.date === dateStr);
    customForDay.forEach(custom => {
        const el = document.createElement('div');
        el.className = 'custom-time-item';
        el.innerHTML = `
            <span class="custom-time-text">${formatTime(custom.startTime)} – ${formatTime(custom.endTime)}</span>
            <span class="custom-time-remove" onclick="removeCustomTime('${custom.date}', '${custom.startTime}')">×</span>
        `;
        customDiv.appendChild(el);
    });
    
    document.getElementById('timeSlotsPanel').style.display = 'block';
    document.getElementById('calendarTapHint').style.display = 'none';
}

function closeTimeSlots() {
    document.getElementById('timeSlotsPanel').style.display = 'none';
    document.querySelector('.btn-suggest-time').style.display = 'block';
    window.currentSelectedDay = null;
    renderCalendar();
}

// Toggle all suggested times for a day
function toggleDaySuggested(dateStr, slots) {
    const gig = window.currentGig;
    
    // Check if all slots for this day are already selected
    const allSelected = slots.every(slot => 
        window.selectedTimes.some(t => t.date === slot.date && t.time === slot.time)
    );
    
    if (allSelected) {
        // Deselect all for this day
        window.selectedTimes = window.selectedTimes.filter(t => t.date !== dateStr);
    } else {
        // Select all for this day
        slots.forEach(slot => {
            const slotIndex = gig.suggestedTimes.findIndex(s => s.date === slot.date && s.time === slot.time);
            if (!window.selectedTimes.some(t => t.date === slot.date && t.time === slot.time)) {
                window.selectedTimes.push({ date: slot.date, time: slot.time, index: slotIndex, type: 'suggested' });
            }
        });
    }
    
    renderCalendar();
    renderAvailabilitySlots();
    updateSelectedSummary();
}

// Select a day from calendar to add custom time
function selectDayForCustomTime(dateStr) {
    window.currentSelectedDay = dateStr;
    
    // Open the custom time picker and pre-fill the date
    const picker = document.getElementById('customTimePicker');
    const btn = document.getElementById('suggestTimeBtn');
    const dateInput = document.getElementById('customDateList');
    
    dateInput.value = dateStr;
    picker.style.display = 'block';
    btn.classList.add('active');
    
    // Update button to show selected date
    const dateObj = new Date(dateStr + 'T00:00:00');
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    btn.innerHTML = `🕐 Adding time for ${dayName}...`;
    
    renderCalendar();
}

// Toggle suggest new time panel
function toggleSuggestNewTime() {
    const picker = document.getElementById('customTimePicker');
    const btn = document.getElementById('suggestTimeBtn');
    
    if (picker.style.display === 'none') {
        picker.style.display = 'block';
        btn.classList.add('active');
        btn.innerHTML = '🕐 Adding a time...';
        window.currentSelectedDay = null;
        renderCalendar();
    } else {
        closeCustomTimePicker();
    }
}

function closeCustomTimePicker() {
    document.getElementById('customTimePicker').style.display = 'none';
    const btn = document.getElementById('suggestTimeBtn');
    btn.classList.remove('active');
    btn.innerHTML = '🕐 Suggest a different time';
    window.currentSelectedDay = null;
    
    // Clear inputs
    document.getElementById('customDateList').value = '';
    document.getElementById('customTimeStartList').value = '';
    document.getElementById('customTimeEndList').value = '';
    
    renderCalendar();
}

function addCustomTimeFromPicker() {
    const date = document.getElementById('customDateList').value;
    const startTime = document.getElementById('customTimeStartList').value;
    const endTime = document.getElementById('customTimeEndList').value;
    
    if (!date) {
        alert('Please select a date');
        return;
    }
    
    if (!startTime || !endTime) {
        alert('Please select both start and end times');
        return;
    }
    
    if (startTime >= endTime) {
        alert('End time must be after start time');
        return;
    }
    
    // Check date is valid (before show, not in past)
    const gig = window.currentGig;
    const showDate = new Date(gig.showDate + 'T00:00:00');
    const selectedDate = new Date(date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
        alert('Cannot select a date in the past');
        return;
    }
    
    if (selectedDate >= showDate) {
        alert('Rehearsal must be before the show date');
        return;
    }
    
    window.customTimes.push({ date, startTime, endTime, type: 'custom' });
    
    // Show checkmark feedback briefly
    const btn = document.getElementById('suggestTimeBtn');
    btn.innerHTML = '✓ Time added!';
    
    setTimeout(() => {
        closeCustomTimePicker();
    }, 800);
    
    renderCalendar();
    updateSelectedSummary();
}

// Render availability slots list
function renderAvailabilitySlots() {
    const gig = window.currentGig;
    if (!gig) return;
    
    const container = document.getElementById('availabilitySlots');
    container.innerHTML = '';
    
    gig.suggestedTimes.forEach((slot, index) => {
        const isSelected = window.selectedTimes.some(t => t.date === slot.date && t.time === slot.time);
        const responses = slot.responses || [];
        
        const el = document.createElement('div');
        el.className = 'availability-slot' + (isSelected ? ' selected' : '');
        el.onclick = () => toggleSlotFromList(slot.date, slot.time, index);
        
        const dateObj = new Date(slot.date + 'T00:00:00');
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        
        el.innerHTML = `
            <div class="slot-check">${isSelected ? '✓' : ''}</div>
            <div class="slot-info">
                <div class="slot-datetime">${dayName} · ${formatTime(slot.time)}</div>
                <div class="slot-responses">${responses.length} ${responses.length === 1 ? 'person' : 'people'} available</div>
            </div>
        `;
        container.appendChild(el);
    });
}

function toggleSlotFromList(date, time, index) {
    const isSelected = window.selectedTimes.some(t => t.date === date && t.time === time);
    
    if (isSelected) {
        window.selectedTimes = window.selectedTimes.filter(t => !(t.date === date && t.time === time));
    } else {
        window.selectedTimes.push({ date, time, index, type: 'suggested' });
    }
    
    renderCalendar();
    renderAvailabilitySlots();
    updateSelectedSummary();
}

function toggleTimeSlot(element) {
    const date = element.dataset.date;
    const time = element.dataset.time;
    const index = parseInt(element.dataset.index);
    
    element.classList.toggle('selected');
    
    if (element.classList.contains('selected')) {
        window.selectedTimes.push({ date, time, index, type: 'suggested' });
    } else {
        window.selectedTimes = window.selectedTimes.filter(t => !(t.date === date && t.time === time));
    }
    
    renderCalendar();
    updateSelectedSummary();
}

function removeCustomTime(date, startTime) {
    window.customTimes = window.customTimes.filter(t => !(t.date === date && t.startTime === startTime));
    renderCalendar();
    updateSelectedSummary();
}

function updateSelectedSummary() {
    const totalSelections = window.selectedTimes.length + window.customTimes.length;
    const summaryDiv = document.getElementById('selectedSummary');
    const chipsDiv = document.getElementById('selectedChips');
    const countSpan = document.getElementById('selectedCount');
    
    if (totalSelections === 0) {
        summaryDiv.style.display = 'none';
        return;
    }
    
    summaryDiv.style.display = 'block';
    countSpan.textContent = `${totalSelections} selected`;
    
    chipsDiv.innerHTML = '';
    
    // Add suggested time chips
    window.selectedTimes.forEach(t => {
        const chip = document.createElement('div');
        chip.className = 'selected-chip';
        const dateObj = new Date(t.date + 'T00:00:00');
        const shortDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        chip.innerHTML = `${shortDate} · ${formatTime(t.time)}<span class="selected-chip-remove" onclick="removeSelectedTime('${t.date}', '${t.time}')">×</span>`;
        chipsDiv.appendChild(chip);
    });
    
    // Add custom time chips
    window.customTimes.forEach(t => {
        const chip = document.createElement('div');
        chip.className = 'selected-chip';
        const dateObj = new Date(t.date + 'T00:00:00');
        const shortDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        chip.innerHTML = `${shortDate} · ${formatTime(t.startTime)}–${formatTime(t.endTime)}<span class="selected-chip-remove" onclick="removeCustomTime('${t.date}', '${t.startTime}')">×</span>`;
        chipsDiv.appendChild(chip);
    });
}

function removeSelectedTime(date, time) {
    window.selectedTimes = window.selectedTimes.filter(t => !(t.date === date && t.time === time));
    renderCalendar();
    updateSelectedSummary();
    
    // Update the panel if it's open for this day
    if (window.currentSelectedDay === date) {
        selectDay(date, new Date(date + 'T00:00:00'));
    }
}

async function submitAvailability() {
    const name = document.getElementById('yourName').value;
    const instrument = document.getElementById('yourInstrument').value;
    
    if (!name) {
        alert('Please enter your name');
        return;
    }
    
    if (!instrument) {
        alert('Please select your instrument');
        return;
    }
    
    const totalSelections = window.selectedTimes.length + window.customTimes.length;
    if (totalSelections === 0) {
        alert('Please select at least one time that works for you');
        return;
    }
    
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Submitting...';
    
    try {
        // Get the current gig data
        const gigRef = window.doc(window.db, "gigs", window.currentGigId);
        const gigSnap = await window.getDoc(gigRef);
        const gig = gigSnap.data();
        
        // Update responses for selected suggested time slots
        gig.suggestedTimes.forEach((slot, index) => {
            if (!slot.responses) slot.responses = [];
            
            // Remove any existing response from this person
            slot.responses = slot.responses.filter(r => r.name.toLowerCase() !== name.toLowerCase());
            
            // Add response if this slot was selected
            const isSelected = window.selectedTimes.some(t => t.date === slot.date && t.time === slot.time);
            if (isSelected) {
                slot.responses.push({ name, instrument, submittedAt: new Date().toISOString() });
            }
        });
        
        // Handle custom times - add them as new suggested times
        window.customTimes.forEach(custom => {
            // Check if this time slot already exists
            const existingSlot = gig.suggestedTimes.find(s => 
                s.date === custom.date && s.time === custom.startTime
            );
            
            if (existingSlot) {
                // Add response to existing slot
                if (!existingSlot.responses.some(r => r.name.toLowerCase() === name.toLowerCase())) {
                    existingSlot.responses.push({ name, instrument, submittedAt: new Date().toISOString() });
                }
            } else {
                // Create new time slot
                gig.suggestedTimes.push({
                    date: custom.date,
                    time: custom.startTime,
                    endTime: custom.endTime,
                    responses: [{ name, instrument, submittedAt: new Date().toISOString() }],
                    addedBy: name
                });
            }
        });
        
        // Track responder ID if logged in
        let responderIds = gig.responderIds || [];
        if (window.currentUser && !responderIds.includes(window.currentUser.uid)) {
            responderIds.push(window.currentUser.uid);
        }
        
        // Save back to Firestore
        await window.updateDoc(gigRef, { 
            suggestedTimes: gig.suggestedTimes,
            responderIds: responderIds
        });
        
        // Check if all band members have responded - trigger notification
        const uniqueResponders = new Set();
        gig.suggestedTimes.forEach(slot => {
            (slot.responses || []).forEach(r => uniqueResponders.add(r.name.toLowerCase()));
        });
        
        // Include current submission
        uniqueResponders.add(name.toLowerCase());
        
        const expectedResponders = gig.expectedResponders || 4;
        if (uniqueResponders.size >= expectedResponders && gig.creatorEmail) {
            // Trigger notification by writing to a notifications collection
            // The Cloud Function will pick this up and send email
            try {
                await window.addDoc(window.collection(window.db, "notifications"), {
                    type: 'all_responded',
                    gigId: window.currentGigId,
                    recipientEmail: gig.creatorEmail,
                    recipientName: gig.creatorName || 'Band Leader',
                    bandName: gig.bandName,
                    venue: gig.venue,
                    responderCount: uniqueResponders.size,
                    createdAt: window.serverTimestamp(),
                    sent: false
                });
                console.log("Notification queued for band leader");
            } catch (notifError) {
                console.error("Error queuing notification:", notifError);
            }
        }
        
        // Update summary
        document.getElementById('summaryName').textContent = name;
        document.getElementById('summaryInstrument').textContent = instrument;
        document.getElementById('summaryTimes').textContent = `${totalSelections} time(s)`;
        
        // Check for confirmed rehearsals
        if (gig.confirmedTimes && gig.confirmedTimes.length > 0) {
            document.getElementById('currentStandings').innerHTML = `
                <h2>✓ Confirmed Rehearsals</h2>
                <p class="standings-note">These rehearsals have been confirmed by the band leader.</p>
                <div id="confirmedRehearsals"></div>
            `;
            const confirmedDiv = document.getElementById('confirmedRehearsals');
            gig.confirmedTimes.forEach(slot => {
                const el = document.createElement('div');
                el.className = 'standing-item best';
                el.innerHTML = `
                    <div class="standing-header">
                        <span class="standing-datetime">${formatDate(slot.date)} · ${formatTime(slot.time)}</span>
                        <span class="standing-count" style="color:#50c850;">✓ Confirmed</span>
                    </div>
                `;
                confirmedDiv.appendChild(el);
            });
        } else {
            // Build standings (existing code)
            const standingsList = document.getElementById('standingsList');
            standingsList.innerHTML = '';
            
            const sortedSlots = [...gig.suggestedTimes].sort((a, b) => 
                (b.responses?.length || 0) - (a.responses?.length || 0)
            );
            
            const maxResponses = sortedSlots[0]?.responses?.length || 0;
            
            sortedSlots.forEach(slot => {
                const count = slot.responses?.length || 0;
                const isBest = count === maxResponses && count > 0;
                
                const standingEl = document.createElement('div');
                standingEl.className = 'standing-item' + (isBest ? ' best' : '');
                
                const peopleHtml = slot.responses?.length > 0
                    ? slot.responses.map(r => `<span class="standing-person">${r.name}</span>`).join('')
                    : '<span class="standing-person" style="opacity:0.5">No one yet</span>';
                
                standingEl.innerHTML = `
                    <div class="standing-header">
                        <span class="standing-datetime">${formatDate(slot.date)} · ${formatTime(slot.time)}</span>
                        <span class="standing-count">${count} available</span>
                    </div>
                    <div class="standing-people">${peopleHtml}</div>
                `;
                standingsList.appendChild(standingEl);
            });
        }
        
        // Show success screen
        document.getElementById('screen4').classList.remove('active');
        document.getElementById('screen5').classList.add('active');
        
        // Hide sign-in prompt if already signed in
        const signInPrompt = document.getElementById('signInPrompt');
        if (signInPrompt && window.currentUser) {
            signInPrompt.style.display = 'none';
        }
    }
});
