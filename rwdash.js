let chainAlertPlayed = false;
const IN_DEBUG_MODE = false;
const HOSP_ALERT_THRESHOLD = 90; // seconds
let ALERT_COOLDOWN = 60000; // milliseconds. Will be set from UI
let ALLOW_AUDIO = true; // Will be set from UI
let TURTLE_IF_OVER_LEVEL = 1; // Will be set from UI
let ATTACK_IF_UNDER_LEVEL = 100; // Will be set from UI
let chainInterval = null;
let hospitalInterval = null;

// Track last play time for each sound
const lastSoundPlayed = {
  chainWarning: 0,
  goGetEm: 0,
};

// Track which hospital members have already triggered goGetEm sound for their current hospital stay
const goGetEmPlayedFor = {}; // { [memberId]: untilTimestamp }

// Track if a sound is currently playing
let soundIsPlaying = false;

// Utility: Format time left as HH:MM:SS
function formatTimeLeft(seconds) {
  if (!seconds || seconds < 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [
    h > 0 ? String(h).padStart(2, "0") : "00",
    String(m).padStart(2, "0"),
    String(s).padStart(2, "0"),
  ].join(":");
}

function playSoundWithCooldown(soundId, key, cooldownMs = ALERT_COOLDOWN) {
  if (!ALLOW_AUDIO) return;
  const now = Date.now();
  if (now - lastSoundPlayed[key] < cooldownMs) return;
  const sound = document.getElementById(soundId);
  if (sound) {
    // If already playing, don't start another
    if (soundIsPlaying) return;
    soundIsPlaying = true;
    sound.play();
    lastSoundPlayed[key] = now;
    // Listen for end of playback to clear flag
    sound.onended = () => {
      soundIsPlaying = false;
      sound.onended = null;
    };
    // Also clear flag if playback fails
    sound.onerror = () => {
      soundIsPlaying = false;
      sound.onerror = null;
    };
  }
}

function loadApiKey() {
  const savedKey = localStorage.getItem("tornApiKey");
  if (savedKey) {
    document.getElementById("apiKey").value = savedKey;
  }
}

function clearApiKey() {
  localStorage.removeItem("tornApiKey");
  document.getElementById("apiKey").value = "";
}

function startMonitoring() {
  const apiKey = document.getElementById("apiKey").value.trim();
  // Save API key to localStorage
  localStorage.setItem("tornApiKey", apiKey);
  const chainThreshold = parseInt(
    document.getElementById("chainThreshold").value
  );
  const enemyFactionId = document.getElementById("enemyFactionId").value.trim();
  const refreshInterval = parseInt(
    document.getElementById("refreshInterval").value.trim()
  );
  ALLOW_AUDIO = document.getElementById("allowAudio").checked;
  ALERT_COOLDOWN =
    parseInt(document.getElementById("audioCooldown").value)*1000 || 60000;
  TURTLE_IF_OVER_LEVEL =
    parseInt(document.getElementById("turtleIfOver").value) || 1;
  ATTACK_IF_UNDER_LEVEL =
    parseInt(document.getElementById("attackIfUnder").value) || 100;

  if (!apiKey || !enemyFactionId) {
    alert("API key and enemy faction ID required");
    return;
  }

  // Hide settings div if it exists
  const settingsDiv = document.getElementById("settings");
  if (settingsDiv) settingsDiv.style.display = "none";

  // Show/Hide buttons
  document.getElementById("startBtn").style.display = "none";
  document.getElementById("stopBtn").style.display = "";

  // Unlock audio for future play
  const chainWarningSound = document.getElementById("chainWarningSound");
  chainWarningSound
    .play()
    .then(() => {
      chainWarningSound.pause();
      chainWarningSound.currentTime = 0;
    })
    .catch(() => {
      // Ignore errors here, browser will allow play after interaction
    });

  const goGetEmSound = document.getElementById("goGetEmSound");
  goGetEmSound
    .play()
    .then(() => {
      goGetEmSound.pause();
      goGetEmSound.currentTime = 0;
    })
    .catch(() => {
      // Ignore errors here, browser will allow play after interaction
    });

  checkChain(apiKey, chainThreshold);
  populateEnemyTables(apiKey, enemyFactionId);

  // Clear previous intervals if any
  if (typeof chainInterval !== "undefined" && chainInterval) clearInterval(chainInterval);
  if (typeof hospitalInterval !== "undefined" && hospitalInterval) clearInterval(hospitalInterval);

  chainInterval = setInterval(
    () => checkChain(apiKey, chainThreshold),
    refreshInterval * 1000
  );
  hospitalInterval = setInterval(
    () => populateEnemyTables(apiKey, enemyFactionId),
    refreshInterval * 1000
  );
}

function stopMonitoring() {
  // Show settings div
  const settingsDiv = document.getElementById("settings");
  if (settingsDiv) settingsDiv.style.display = "";

  // Show/Hide buttons
  document.getElementById("startBtn").style.display = "";
  document.getElementById("stopBtn").style.display = "none";

  // Clear intervals
  if (typeof chainInterval !== "undefined" && chainInterval) {
    clearInterval(chainInterval);
    chainInterval = null;
  }
  if (typeof hospitalInterval !== "undefined" && hospitalInterval) {
    clearInterval(hospitalInterval);
    hospitalInterval = null;
  }
}

async function checkChain(apiKey, threshold) {
  if (soundIsPlaying) return; // Pause updates while sound is playing
  const url = `https://api.torn.com/faction/?selections=chain&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return;
  const data = await res.json();
  if (IN_DEBUG_MODE) console.log("Chain data:", data);

  const remaining = data.chain?.timeout || 0;
  const currentlen = data.chain?.current || 0;
  const cooldown = data.chain?.cooldown || 0;
  var inchain = false;

  var chainstatus = "Unknown Status";
  if (remaining > 0 && currentlen > 0) {
    chainstatus = `Chain in progress ${remaining} sec remaining`;
    inchain = true;
  } else if (cooldown > 0) {
    chainstatus = `Chain in cooldown for ${cooldown} sec`;
  } else {
    chainstatus = "No chain in progress";
  }

  document.getElementById("chainStatus").textContent = chainstatus;

  const div = document.getElementById("chainStatus");
  if (remaining < threshold && inchain) {
    div.classList.add("text-danger", "alert-blink");
    if (!chainAlertPlayed) {
      playSoundWithCooldown("chainWarningSound", "chainWarning");
      chainAlertPlayed = true;
    }
  } else {
    div.classList.remove("text-danger", "alert-blink");
    chainAlertPlayed = false;
  }
}

async function populateEnemyTables(apiKey, factionId) {
  if (soundIsPlaying) return; // Pause updates while sound is playing
  const url = `https://api.torn.com/v2/faction/${factionId}/members?key=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (IN_DEBUG_MODE) console.log("Faction data:", data);
    const members = Object.values(data.members || {});
    const now = Math.floor(Date.now() / 1000);

    const hospitalTable = $('#hospitalTable').DataTable();
    const okayTable = $('#okayTable').DataTable();
    hospitalTable.clear();
    okayTable.clear();
    const hospitalMembers = [];
    const okayMembers = [];
    for (const m of members) {
      if (m.status?.state === "Hospital" && m.status?.until) {
        hospitalMembers.push(m);
      } else {
        okayMembers.push(m);
      }
    }
    hospitalMembers.sort((a, b) => a.level - b.level);
    okayMembers.sort((a, b) => b.level - a.level);

    //update counts in headers
    const okhead = document.getElementById('enemyOkHeader');
    okhead.innerText = "Enemies that are okay ("+ okayMembers.length + ")";
    const hosphead = document.getElementById('enemyHospHeader');
    okhead.innerText = "Enemies in hospital ("+ hospitalMembers.length + ")";

    const highLevelOnlineOk = okayMembers.some(
      (m) =>
        m.level > TURTLE_IF_OVER_LEVEL &&
        m.status?.description === "Okay" &&
        (m.last_action?.status === "Online" || m.last_action?.status === "Idle")
    );
    // Update turtle/attack image card
    const turtleAttackImg = document.getElementById('turtleAttackImg');
    if (turtleAttackImg) {
      turtleAttackImg.src = highLevelOnlineOk ? 'images/turtle.png' : 'images/attack.png';
      turtleAttackImg.alt = highLevelOnlineOk ? 'Turtle' : 'Attack';
    }
    for (const m of hospitalMembers) {
      const lastAction = m.last_action
        ? `${m.last_action.status} (${m.last_action.relative || ""})`
        : "";
      const timeLeft = m.status.until - now;
      const highlight = timeLeft < HOSP_ALERT_THRESHOLD ? 'hospital-alert' : "";
      const rowNode = hospitalTable.row.add([
        `<a href=\"https://www.torn.com/profiles.php?XID=${m.id}\" target=\"_blank\">${m.name}</a>`,
        `<a href=\"https://www.torn.com/loader2.php?sid=getInAttack&user2ID=${m.id}\" target=\"_blank\">🔫💣🔪</a>`,
        m.level,
        m.status.state,
        lastAction,
        new Date(m.status.until * 1000).toLocaleTimeString(),
        formatTimeLeft(timeLeft)
      ]).node();
      if (rowNode && highlight) rowNode.className = highlight;
      if (
        timeLeft < HOSP_ALERT_THRESHOLD &&
        ALLOW_AUDIO &&
        !highLevelOnlineOk &&
        m.level <= ATTACK_IF_UNDER_LEVEL
      ) {
        // Only play sound if not already played for this member's current hospital stay
        if (goGetEmPlayedFor[m.id] !== m.status.until) {
          playSoundWithCooldown("goGetEmSound", "goGetEm", ALERT_COOLDOWN);
          goGetEmPlayedFor[m.id] = m.status.until;
        }
      } else {
        // Reset tracking if member is no longer in alert state or eligible
        if (goGetEmPlayedFor[m.id] && goGetEmPlayedFor[m.id] !== m.status.until) {
          delete goGetEmPlayedFor[m.id];
        }
      }
    }
    for (const m of okayMembers) {
      const lastAction = m.last_action
        ? `${m.last_action.status} (${m.last_action.relative || ""})`
        : "";
      okayTable.row.add([
        `<a href=\"https://www.torn.com/profiles.php?XID=${m.id}\" target=\"_blank\">${m.name}</a>`,
        `<a href=\"https://www.torn.com/loader2.php?sid=getInAttack&user2ID=${m.id}\" target=\"_blank\">🔫💣🔪</a>`,
        m.level,
        m.status?.state || "",
        lastAction
      ]);
    }
    hospitalTable.draw();
    okayTable.draw();
  } catch (err) {
    if (IN_DEBUG_MODE) console.error("Error fetching faction data:", err);
  }
}

// DataTables initialization (call this after DOM is ready)
document.addEventListener('DOMContentLoaded', function() {
  if (window.jQuery && $.fn.DataTable) {
    $('#hospitalTable').DataTable({
      destroy: true,
      paging: true,
      searching: true,
      order: [[2, 'asc']],
      columnDefs: [ { targets: [1], orderable: false } ]
    });
    $('#okayTable').DataTable({
      destroy: true,
      paging: true,
      searching: true,
      order: [[2, 'desc']],
      columnDefs: [ { targets: [1], orderable: false } ]
    });
  }
});
