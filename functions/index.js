const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { defineSecret } = require('firebase-functions/params');

admin.initializeApp();
const db = admin.firestore();

// Define secrets for Google OAuth
const googleClientId = defineSecret('GOOGLE_CLIENT_ID');
const googleClientSecret = defineSecret('GOOGLE_CLIENT_SECRET');

// OG Tags for link previews
exports.ogTags = functions.https.onRequest(async (req, res) => {
  const path = req.path;
  
  // Extract gig ID from /e/GIGID path
  const pathMatch = path.match(/^\/e\/([^/?]+)/);
  
  if (!pathMatch) {
    res.redirect('/');
    return;
  }
  
  const gigId = pathMatch[1];
  
  try {
    const gigDoc = await db.collection('gigs').doc(gigId).get();
    
    if (!gigDoc.exists) {
      res.redirect('/');
      return;
    }
    
    const gig = gigDoc.data();
    
    // Escape HTML entities in strings
    const escapeHtml = (str) => {
      if (!str) return '';
      return str.replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
    };
    
    // Format the date
    const showDate = new Date(gig.showDate + 'T00:00:00');
    const dateStr = showDate.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
    
    // Build description
    const confirmedCount = gig.confirmedTimes?.length || 0;
    let description = `${dateStr}`;
    if (confirmedCount > 0) {
      description += ` • ${confirmedCount} rehearsal${confirmedCount > 1 ? 's' : ''} confirmed`;
    }
    
    const title = escapeHtml(`${gig.bandName} @ ${gig.venue}`);
    const desc = escapeHtml(description);
    
    // Get image URL (show graphic or default)
    const imageUrl = gig.showGraphic?.url || 'https://tempocal.app/default-og.png';
    
    // Build the HTML with Open Graph tags
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  
  <!-- Open Graph / Facebook / iMessage -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://tempocal.app/e/${gigId}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${imageUrl}">
  
  <!-- Redirect to the actual app -->
  <meta http-equiv="refresh" content="0;url=/?gig=${gigId}">
</head>
<body>
  <p>Loading event...</p>
  <script>
    window.location.href = '/?gig=${gigId}';
  </script>
</body>
</html>`;
    
    res.set('Content-Type', 'text/html');
    res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.status(200).send(html);
    
  } catch (error) {
    console.error('Error fetching gig:', error);
    res.redirect('/');
  }
});

// Band preview for link previews
exports.bandPreview = functions.https.onRequest(async (req, res) => {
  const path = req.path;
  
  // Extract band ID from /b/BANDID path
  const pathMatch = path.match(/^\/b\/([^/?]+)/);
  
  if (!pathMatch) {
    res.redirect('/');
    return;
  }
  
  const bandId = pathMatch[1];
  
  try {
    const bandDoc = await db.collection('bands').doc(bandId).get();
    
    if (!bandDoc.exists) {
      res.redirect('/');
      return;
    }
    
    const band = bandDoc.data();
    
    const escapeHtml = (str) => {
      if (!str) return '';
      return str.replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
    };
    
    const title = escapeHtml(`Join ${band.name} on Tempo`);
    const desc = escapeHtml(band.bio || 'Join this band on Tempo');
    const imageUrl = band.photoURL || 'https://tempocal.app/default-og.png';
    
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://tempocal.app/b/${bandId}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="400">
  <meta property="og:image:height" content="400">
  
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${imageUrl}">
  
  <meta http-equiv="refresh" content="0;url=/?band=${bandId}">
</head>
<body>
  <p>Loading...</p>
  <script>window.location.href = '/?band=${bandId}';</script>
</body>
</html>`;
    
    res.set('Content-Type', 'text/html');
    res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.status(200).send(html);
    
  } catch (error) {
    console.error('Error fetching band:', error);
    res.redirect('/');
  }
});

// Process notification requests and create email documents
// This works with the Firebase "Trigger Email" extension
exports.processNotification = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snap, context) => {
    const notification = snap.data();
    
    if (notification.sent) {
      return null;
    }
    
    try {
      if (notification.type === 'all_responded') {
        // Create an email document for the Trigger Email extension
        await db.collection('mail').add({
          to: notification.recipientEmail,
          message: {
            subject: `🎸 Everyone's in! ${notification.bandName} is ready to rehearse`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #333;">All ${notification.responderCount} band members have responded!</h2>
                <p style="color: #666; font-size: 16px;">
                  Your band <strong>${notification.bandName}</strong> ${notification.venue ? `@ ${notification.venue}` : ''} is ready to lock in rehearsal times.
                </p>
                <p style="margin: 30px 0;">
                  <a href="https://tempocal.app/?leader=${notification.gigId}" 
                     style="background: #4CAF50; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 500;">
                    View Responses & Confirm
                  </a>
                </p>
                <p style="color: #888; font-size: 13px;">
                  — Tempo
                </p>
              </div>
            `
          }
        });
        
        // Mark notification as sent
        await snap.ref.update({ sent: true, sentAt: admin.firestore.FieldValue.serverTimestamp() });
        
        console.log(`Email queued for ${notification.recipientEmail}`);
      }
      
      if (notification.type === 'rehearsals_confirmed') {
        // Format the confirmed times for the email
        const confirmedTimesHtml = notification.confirmedTimes.map(slot => {
          const date = new Date(slot.date + 'T00:00:00');
          const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
          // Format time from 24h to 12h
          let timeStr = slot.time;
          try {
            const [hours, minutes] = slot.time.split(':');
            const h = parseInt(hours);
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            timeStr = `${h12}:${minutes} ${ampm}`;
          } catch (e) {}
          return `<li style="margin: 8px 0; color: #333;">${dateStr} at ${timeStr}</li>`;
        }).join('');
        
        // Get emails from responderIds by looking up users
        const responderIds = notification.responderIds || [];
        const emailPromises = responderIds.map(async (uid) => {
          try {
            const userRecord = await admin.auth().getUser(uid);
            return userRecord.email;
          } catch (e) {
            console.error(`Could not get email for user ${uid}:`, e);
            return null;
          }
        });
        
        const emails = (await Promise.all(emailPromises)).filter(e => e);
        
        // Send email to each musician
        for (const email of emails) {
          await db.collection('mail').add({
            to: email,
            message: {
              subject: `✅ Rehearsals confirmed for ${notification.bandName}!`,
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
                  <h2 style="color: #333;">Rehearsals are locked in! 🎉</h2>
                  <p style="color: #666; font-size: 16px;">
                    <strong>${notification.bandName}</strong> ${notification.venue ? `@ ${notification.venue}` : ''} has confirmed rehearsal times:
                  </p>
                  <ul style="background: #f5f5f5; padding: 20px 20px 20px 40px; border-radius: 8px; margin: 20px 0;">
                    ${confirmedTimesHtml}
                  </ul>
                  ${notification.rehearsalLocation ? `<p style="color: #666; font-size: 14px;">📍 Location: ${notification.rehearsalLocation}</p>` : ''}
                  <p style="margin: 30px 0;">
                    <a href="https://tempocal.app/?event=${notification.gigId}" 
                       style="background: #4CAF50; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 500;">
                      View Details & Add to Calendar
                    </a>
                  </p>
                  <p style="color: #888; font-size: 13px;">
                    You can also find this gig anytime in <a href="https://tempocal.app" style="color: #888;">My Gigs</a> on Tempo.
                  </p>
                  <p style="color: #888; font-size: 13px;">
                    — Tempo
                  </p>
                </div>
              `
            }
          });
          console.log(`Rehearsal confirmation email queued for ${email}`);
        }
        
        // Mark notification as sent
        await snap.ref.update({ 
          sent: true, 
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          emailsSent: emails.length 
        });
      }
      
      return null;
    } catch (error) {
      console.error('Error processing notification:', error);
      return null;
    }
  });

// ============================================
// GOOGLE CALENDAR OAUTH FUNCTIONS
// ============================================

// Start OAuth flow - redirects user to Google
exports.startCalendarAuth = functions
  .runWith({ secrets: [googleClientId] })
  .https.onRequest((req, res) => {
  const userId = req.query.userId;
  const returnUrl = req.query.returnUrl || 'https://tempocal.app';
  
  if (!userId) {
    res.status(400).send('Missing userId');
    return;
  }
  
  // Store state for security (userId + return URL)
  const state = Buffer.from(JSON.stringify({ userId, returnUrl })).toString('base64');
  
  const clientId = googleClientId.value();
  const redirectUri = 'https://us-central1-bandcal-89c81.cloudfunctions.net/oauthCallback';
  const scope = 'https://www.googleapis.com/auth/calendar.readonly';
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${encodeURIComponent(state)}`;
  
  res.redirect(authUrl);
});

// OAuth callback - exchanges code for tokens
exports.oauthCallback = functions
  .runWith({ secrets: [googleClientId, googleClientSecret] })
  .https.onRequest(async (req, res) => {
  
  const code = req.query.code;
  const state = req.query.state;
  const error = req.query.error;
  
  if (error) {
    res.redirect('https://tempocal.app?calendarError=' + error);
    return;
  }
  
  if (!code || !state) {
    res.status(400).send('Missing code or state');
    return;
  }
  
  // Decode state
  let stateData;
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64').toString());
  } catch (e) {
    res.status(400).send('Invalid state');
    return;
  }
  
  const { userId, returnUrl } = stateData;
  
  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: googleClientId.value(),
        client_secret: googleClientSecret.value(),
        redirect_uri: 'https://us-central1-bandcal-89c81.cloudfunctions.net/oauthCallback',
        grant_type: 'authorization_code'
      })
    });
    
    const tokens = await tokenResponse.json();
    
    if (tokens.error) {
      console.error('Token error:', tokens);
      res.redirect(`${returnUrl}?calendarError=${tokens.error}`);
      return;
    }
    
    // Store refresh token in secure collection
    await db.collection('calendarTokens').doc(userId).set({
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresAt: Date.now() + (tokens.expires_in * 1000),
      connectedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Update user profile to show connected (use set with merge in case user doc doesn't exist yet)
    await db.collection('users').doc(userId).set({
      calendarConnected: true,
      calendarConnectedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    // Redirect back to app
    res.redirect(`${returnUrl}?calendarConnected=true`);
    
  } catch (error) {
    console.error('OAuth error:', error);
    res.redirect(`${returnUrl}?calendarError=token_exchange_failed`);
  }
});

// Disconnect calendar
exports.disconnectCalendar = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  const userId = req.query.userId;
  
  if (!userId) {
    res.status(400).json({ error: 'Missing userId' });
    return;
  }
  
  try {
    // Delete tokens
    await db.collection('calendarTokens').doc(userId).delete();
    
    // Update profile
    await db.collection('users').doc(userId).update({
      calendarConnected: false
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Helper function to get a fresh access token
async function getFreshAccessToken(userId, clientId, clientSecret) {
  const tokenDoc = await db.collection('calendarTokens').doc(userId).get();
  
  if (!tokenDoc.exists) {
    return null;
  }
  
  const tokenData = tokenDoc.data();
  
  // Check if token is still valid (with 5 min buffer)
  if (tokenData.expiresAt > Date.now() + 300000) {
    return tokenData.accessToken;
  }
  
  // Need to refresh
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: tokenData.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token'
      })
    });
    
    const tokens = await response.json();
    
    if (tokens.error) {
      console.error('Refresh error:', tokens);
      return null;
    }
    
    // Update stored token
    await db.collection('calendarTokens').doc(userId).update({
      accessToken: tokens.access_token,
      expiresAt: Date.now() + (tokens.expires_in * 1000)
    });
    
    return tokens.access_token;
    
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
}

// Get band members' busy times for calendar view
exports.getBandBusyTimes = functions
  .runWith({ secrets: [googleClientId, googleClientSecret] })
  .https.onRequest(async (req, res) => {
  
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  const bandId = req.query.bandId;
  const showDate = req.query.showDate;
  
  if (!bandId) {
    res.status(400).json({ error: 'Missing bandId' });
    return;
  }
  
  try {
    // Get band info
    const bandDoc = await db.collection('bands').doc(bandId).get();
    if (!bandDoc.exists) {
      res.status(404).json({ error: 'Band not found' });
      return;
    }
    const band = bandDoc.data();
    
    // Collect user IDs and names of members with calendars connected
    const members = [];
    
    // Check leader
    if (band.leaderId) {
      const leaderProfile = await db.collection('users').doc(band.leaderId).get();
      if (leaderProfile.exists && leaderProfile.data().calendarConnected) {
        members.push({
          userId: band.leaderId,
          name: band.leaderName || 'Leader'
        });
      }
    }
    
    // Check members
    const membersSnap = await db.collection('bandMembers')
      .where('bandId', '==', bandId)
      .where('status', '==', 'accepted')
      .get();
    
    for (const memberDoc of membersSnap.docs) {
      const member = memberDoc.data();
      if (member.userId) {
        const profileDoc = await db.collection('users').doc(member.userId).get();
        if (profileDoc.exists && profileDoc.data().calendarConnected) {
          members.push({
            userId: member.userId,
            name: member.name || 'Member'
          });
        }
      }
    }
    
    if (members.length === 0) {
      res.json({ busyTimes: {}, memberNames: [] });
      return;
    }
    
    // Calculate date range
    let endDate;
    if (showDate) {
      endDate = new Date(showDate + 'T23:59:59');
    } else {
      endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 3);
    }
    
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    
    // Query each calendar
    const busyTimes = {};
    const memberNames = [];
    
    const clientId = googleClientId.value();
    const clientSecret = googleClientSecret.value();
    
    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      memberNames.push(member.name);
      busyTimes[i] = [];
      
      // Get fresh access token
      const accessToken = await getFreshAccessToken(member.userId, clientId, clientSecret);
      
      if (!accessToken) {
        console.log(`No valid token for ${member.name}`);
        continue;
      }
      
      try {
        // First, get list of all user's calendars
        const calListResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        let calendarIds = ['primary'];
        
        if (calListResponse.ok) {
          const calListData = await calListResponse.json();
          if (calListData.items) {
            // Get all calendar IDs (filter out declined/hidden ones)
            calendarIds = calListData.items
              .filter(cal => cal.selected !== false)
              .map(cal => cal.id);
          }
        }
        
        // Query freeBusy for all calendars at once
        const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            timeMin: startDate.toISOString(),
            timeMax: endDate.toISOString(),
            items: calendarIds.map(id => ({ id }))
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          // Combine busy times from all calendars
          const allBusy = [];
          if (data.calendars) {
            for (const calId in data.calendars) {
              if (data.calendars[calId].busy) {
                allBusy.push(...data.calendars[calId].busy);
              }
            }
          }
          busyTimes[i] = allBusy;
        } else {
          console.log(`Calendar API error for ${member.name}:`, await response.text());
        }
      } catch (e) {
        console.error(`Error querying calendar for ${member.name}:`, e);
      }
    }
    
    res.json({ busyTimes, memberNames });
    
  } catch (error) {
    console.error('Error getting band busy times:', error);
    res.status(500).json({ error: 'Error checking calendars' });
  }
});
