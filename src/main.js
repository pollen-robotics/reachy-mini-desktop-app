const { invoke } = window.__TAURI__.core;

let statusDot;
let statusText;
let statusDetails;
let startBtn;
let stopBtn;

async function checkRobotStatus() {
  try {
    statusText.textContent = "Checking...";
    statusDot.className = "dot checking";
    statusDetails.textContent = "";

    // Check if Reachy Mini daemon responds
    const response = await fetch("http://localhost:8000/api/state/full");
    
    if (response.ok) {
      const data = await response.json();
      statusDot.className = "dot active";
      statusText.textContent = "Active";
      
      // Display some details about the state
      const details = [];
      if (data.is_on !== undefined) {
        details.push(`Robot ${data.is_on ? 'on' : 'off'}`);
      }
      statusDetails.textContent = details.join(" • ");
      
      // Enable/disable buttons
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } else {
      throw new Error("Invalid response");
    }
  } catch (error) {
    statusDot.className = "dot inactive";
    statusText.textContent = "Inactive";
    statusDetails.textContent = "Reachy Mini daemon is not started";
    
    // Enable/disable buttons
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

async function startDaemon() {
  try {
    startBtn.disabled = true;
    statusText.textContent = "Starting...";
    statusDot.className = "dot checking";
    statusDetails.textContent = "Launching daemon...";
    
    await invoke("start_daemon");
    
    // Wait a bit for daemon to start
    setTimeout(checkRobotStatus, 2000);
  } catch (error) {
    statusDetails.textContent = `Error: ${error}`;
    startBtn.disabled = false;
  }
}

async function stopDaemon() {
  try {
    stopBtn.disabled = true;
    statusText.textContent = "Stopping...";
    statusDot.className = "dot checking";
    statusDetails.textContent = "Stopping daemon...";
    
    await invoke("stop_daemon");
    
    // Wait longer for daemon to actually stop
    setTimeout(() => {
      checkRobotStatus();
    }, 2000);
  } catch (error) {
    statusDetails.textContent = `Error: ${error}`;
    stopBtn.disabled = false;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  statusDot = document.querySelector("#status-dot");
  statusText = document.querySelector("#status-text");
  statusDetails = document.querySelector("#status-details");
  startBtn = document.querySelector("#start-btn");
  stopBtn = document.querySelector("#stop-btn");
  
  // Check status on startup
  checkRobotStatus();
  
  // Refresh every 5 seconds
  setInterval(checkRobotStatus, 5000);
  
  // Manual refresh button
  document.querySelector("#refresh-btn").addEventListener("click", () => {
    checkRobotStatus();
  });
  
  // Daemon control buttons
  startBtn.addEventListener("click", startDaemon);
  stopBtn.addEventListener("click", stopDaemon);
});
