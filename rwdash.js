// script.js
let chainAlertPlayed = false;
const IN_DEBUG_MODE = false;
const HOSP_ALERT_THRESHOLD = 60; // seconds
const ALERT_COOLDOWN = 1000; // milliseconds. yes. i know it's not consistent with the line above

// Track last play time for each sound
const lastSoundPlayed = {
  chainWarning: 0,
  goGetEm: 0
};

function playSoundWithCooldown(soundId, key, cooldownMs = ALERT_COOLDOWN) {
  const now = Date.now();
  if (now - lastSoundPlayed[key] < cooldownMs) return;
  const sound = document.getElementById(soundId);
  if (sound) {
    sound.play();
    lastSoundPlayed[key] = now;
  }
}

function loadApiKey() {
  const savedKey = localStorage.getItem('tornApiKey');
  if (savedKey) {
    document.getElementById('apiKey').value = savedKey;
  }
}

function clearApiKey() {
  localStorage.removeItem('tornApiKey');
  document.getElementById('apiKey').value = '';
}

function startMonitoring() {
  const apiKey = document.getElementById('apiKey').value.trim();
  // Save API key to localStorage
  localStorage.setItem('tornApiKey', apiKey);
  const chainThreshold = parseInt(document.getElementById('chainThreshold').value);
  const enemyFactionId = document.getElementById('enemyFactionId').value.trim();
  const refreshInterval = parseInt(document.getElementById('refreshInterval').value.trim());

  if (!apiKey || !enemyFactionId) {
    alert('API key and enemy faction ID required');
    return;
  }

  // Unlock audio for future play
  const chainWarningSound = document.getElementById('chainWarningSound');
  chainWarningSound.play().then(() => {
    chainWarningSound.pause();
    chainWarningSound.currentTime = 0;
  }).catch(() => {
    // Ignore errors here, browser will allow play after interaction
  });

  const goGetEmSound = document.getElementById('goGetEmSound');
  goGetEmSound.play().then(() => {
    goGetEmSound.pause();
    goGetEmSound.currentTime = 0;
  }).catch(() => {
    // Ignore errors here, browser will allow play after interaction
  });

  checkChain(apiKey, chainThreshold);
  checkEnemyHospital(apiKey, enemyFactionId);

  setInterval(() => checkChain(apiKey, chainThreshold), refreshInterval * 1000);
  setInterval(() => checkEnemyHospital(apiKey, enemyFactionId), refreshInterval * 1000);
}

async function checkChain(apiKey, threshold) {
  const url = `https://api.torn.com/faction/?selections=chain&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return;
  const data = await res.json();
  if (IN_DEBUG_MODE) console.log('Chain data:', data);

  const remaining = data.chain?.cooldown || 0;
  const currentlen = data.chain?.current || 0;
  const cooldown = data.chain?.cooldown || 0;
  var inchain = false;

  var chainstatus = 'Unknown Status';
  if (remaining > 0 && currentlen > 0) {
    chainstatus = 'Chain in progress ${remaining} sec remaining';
    inchain = true;
  } else if (cooldown> 0) {
    chainstatus = 'Chain in cooldown for ${cooldown} sec';
  } else {
    chainstatus = 'No chain in progress';
  }
  

  document.getElementById('chainStatus').textContent = chainstatus;

  const div = document.getElementById('chainStatus');
  if (remaining < threshold && inchain) {
    div.classList.add('text-danger', 'alert-blink');
    if (!chainAlertPlayed) {
      playSoundWithCooldown('chainWarningSound', 'chainWarning');
      chainAlertPlayed = true;
    }
  } else {
    div.classList.remove('text-danger', 'alert-blink');
    chainAlertPlayed = false;
  }
}

async function checkEnemyHospital(apiKey, factionId) {
  //const url = `https://api.torn.com/faction/${factionId}?selections=basic&key=${apiKey}`;
  const url = `https://api.torn.com/v2/faction/${factionId}/members?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return;
  const data = await res.json();

  // Log the response for inspection
  if (IN_DEBUG_MODE) console.log('Faction data:', data);

  const members = Object.values(data.members || {});
  const now = Math.floor(Date.now() / 1000);
  const tbody = document.querySelector('#hospitalTable tbody');
  tbody.innerHTML = '';

  // Show all hospd members
  members.forEach(m => {
    if (m.status?.state === 'Hospital' && m.status?.until) {
      // Phase 4: Calculate time left
      const timeLeft = m.status.until - now;
      // Format timeLeft as hh:mm:ss
      function formatTimeLeft(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return [
          h > 0 ? String(h).padStart(2, '0') : '00',
          String(m).padStart(2, '0'),
          String(s).padStart(2, '0')
        ].join(':');
      }

      const row = `<tr>
        <td><a href="https://www.torn.com/profiles.php?XID=${m.id}" target="_blank">${m.name}</a></td>
        <td><a href="https://www.torn.com/loader2.php?sid=getInAttack&user2ID=${m.id}" target="_blank">🔫💣🔪</a></td>
        <td>${m.level}</td>
        <td>${m.status.state}</td>
        <td>${new Date(m.status.until * 1000).toLocaleTimeString()}</td>
        <td>${formatTimeLeft(timeLeft)}</td>
      </tr>`;
      // https://www.torn.com/profiles.php?XID=1865243
      // 
      tbody.innerHTML += row;

      // Alert if time left is less than 60 seconds
      if (timeLeft < HOSP_ALERT_THRESHOLD) playSoundWithCooldown('goGetEmSound', 'goGetEm');
    }
  });
}
