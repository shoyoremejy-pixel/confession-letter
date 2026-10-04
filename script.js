(() => {
  const screens = Array.from(document.querySelectorAll(".screen"));
  const liveMessage = document.querySelector("#live-message");
  const celebrationLayer = document.querySelector("#celebration-layer");
  const emailEndpoint = "https://formsubmit.co/ajax/johnjeremyeugenio22@gmail.com";
  const envelope = document.querySelector(".envelope");
  const openButton = document.querySelector("#open-letter");
  const noButton = document.querySelector("#no-button");
  const dodgeMessage = document.querySelector("#dodge-message");
  const challenge = document.querySelector("#challenge");
  const honestToggle = document.querySelector("#honest-choice-toggle");
  const honestOptions = document.querySelector("#honest-choice-options");
  const musicToggle = document.querySelector("#music-toggle");
  const soundToggle = document.querySelector("#sound-toggle");
  const audioStatus = document.querySelector("#audio-status");
  const playfulMessages = [
    "Hehe, try again! 🙈",
    "Are you sure? 🥺",
    "Waittt, don't click me! 😭",
    "Catch me first! 💨"
  ];
  let dodgeCount = 0;
  let lastDodgeAt = 0;
  let messageIndex = 0;
  let pendingTouchDodge = false;
  let pendingTouchDodgeTimer;
  let openingTimer;
  let audioContext;
  let musicBus;
  let effectsBus;
  let musicTimer;
  let musicStep = 0;
  let musicEnabled = false;
  let soundsEnabled = true;

  const melody = [523.25, 587.33, 659.25, 587.33, 523.25, 440, 392, 440, 523.25, 659.25, 783.99, 659.25, 587.33, 523.25, 440, 392];
  const harmonies = [
    [174.61, 220, 261.63],
    [130.81, 196, 261.63],
    [146.83, 196, 246.94],
    [146.83, 220, 293.66]
  ];

  function getAudioContext() {
    if (audioContext) return audioContext;
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      audioStatus.textContent = "Audio is not supported in this browser.";
      return null;
    }

    try {
      audioContext = new AudioContextConstructor();
      musicBus = audioContext.createGain();
      effectsBus = audioContext.createGain();
      musicBus.gain.value = 0.0001;
      effectsBus.gain.value = soundsEnabled ? 0.24 : 0.0001;
      musicBus.connect(audioContext.destination);
      effectsBus.connect(audioContext.destination);
      return audioContext;
    } catch (error) {
      console.error("Could not initialize audio:", error);
      audioStatus.textContent = "Audio could not be started in this browser.";
      return null;
    }
  }

  function playTone(frequency, startTime, duration, volume, destination, type = "sine") {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.04);
  }

  function playEffectNow(effect) {
    const now = audioContext.currentTime + 0.02;
    const notes = {
      open: [659.25, 783.99, 987.77],
      page: [587.33, 783.99],
      yes: [523.25, 659.25, 783.99, 1046.5],
      no: [440, 392],
      friends: [523.25, 659.25, 783.99],
      hover: [783.99, 987.77]
    };

    if (effect === "dodge") {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(620, now);
      oscillator.frequency.exponentialRampToValueAtTime(230, now + 0.14);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.045, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      oscillator.connect(gain);
      gain.connect(effectsBus);
      oscillator.start(now);
      oscillator.stop(now + 0.18);
      return;
    }

    (notes[effect] || notes.page).forEach((frequency, index) => {
      const duration = effect === "yes" ? 0.36 : 0.25;
      const volume = effect === "yes" ? 0.12 : 0.075;
      playTone(frequency, now + index * 0.085, duration, volume, effectsBus);
    });
  }

  function playEffect(effect) {
    if (!soundsEnabled) return;
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") {
      context.resume().then(() => playEffectNow(effect)).catch((error) => {
        console.error("Could not resume audio for a sound effect:", error);
        audioStatus.textContent = "Sound effects could not be started.";
      });
      return;
    }
    playEffectNow(effect);
  }

  function playMusicStep() {
    const now = audioContext.currentTime + 0.035;
    const step = musicStep % melody.length;
    playTone(melody[step], now, 0.57, 0.045, musicBus);
    if (step % 4 === 0) {
      const chord = harmonies[Math.floor(step / 4) % harmonies.length];
      chord.forEach((frequency) => playTone(frequency, now, 1.9, 0.012, musicBus, "triangle"));
    }
    musicStep += 1;
  }

  async function toggleMusic() {
    const context = getAudioContext();
    if (!context) return;
    try {
      await context.resume();
      musicEnabled = !musicEnabled;
      const now = context.currentTime;
      musicBus.gain.cancelScheduledValues(now);
      musicBus.gain.setTargetAtTime(musicEnabled ? 0.48 : 0.0001, now, 0.18);
      if (musicEnabled) {
        playMusicStep();
        musicTimer = window.setInterval(playMusicStep, 640);
      } else {
        window.clearInterval(musicTimer);
      }
      musicToggle.setAttribute("aria-pressed", String(musicEnabled));
      musicToggle.textContent = musicEnabled ? "♫ Music: On" : "♫ Music: Off";
      audioStatus.textContent = musicEnabled ? "Romantic background music is on." : "Background music is off.";
    } catch (error) {
      console.error("Could not toggle background music:", error);
      audioStatus.textContent = "Music could not be started. Please try again.";
    }
  }

  async function toggleSoundEffects() {
    const nextValue = !soundsEnabled;
    if (nextValue) {
      const context = getAudioContext();
      if (!context) return;
      try {
        await context.resume();
      } catch (error) {
        console.error("Could not enable sound effects:", error);
        audioStatus.textContent = "Sound effects could not be enabled. Please try again.";
        return;
      }
    }

    soundsEnabled = nextValue;
    soundToggle.setAttribute("aria-pressed", String(soundsEnabled));
    soundToggle.textContent = soundsEnabled ? "♪ Sounds: On" : "♪ Sounds: Off";
    if (effectsBus) {
      effectsBus.gain.setTargetAtTime(soundsEnabled ? 0.24 : 0.0001, audioContext.currentTime, 0.08);
    }
    audioStatus.textContent = soundsEnabled ? "Sound effects are on." : "Sound effects are off.";
  }

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    musicToggle.disabled = true;
    soundToggle.disabled = true;
    audioStatus.textContent = "Audio is not supported in this browser.";
  }

  musicToggle.addEventListener("click", toggleMusic);
  soundToggle.addEventListener("click", toggleSoundEffects);

  function announce(message) {
    liveMessage.textContent = "";
    window.setTimeout(() => {
      liveMessage.textContent = message;
    }, 20);
  }

  function focusScreen(screen) {
    const heading = screen.querySelector("h1, h2");
    if (!heading) return;
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }

  function showScreen(id) {
    const nextScreen = document.getElementById(id);
    if (!nextScreen) return;
    screens.forEach((screen) => {
      const active = screen === nextScreen;
      screen.hidden = !active;
      screen.classList.toggle("is-active", active);
    });
    if (nextScreen.id !== "choice-screen") resetDodgeButton();
    focusScreen(nextScreen);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetDodgeButton() {
    noButton.classList.remove("is-dodging");
    noButton.style.left = "";
    noButton.style.top = "";
    noButton.style.transform = "";
  }

  function celebrateConfession() {
    const colors = ["#eb829a", "#f4b16f", "#c998cf", "#f1c7a2", "#d97b95"];
    for (let index = 0; index < 88; index += 1) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.setProperty("--x", `${Math.random() * 100}%`);
      piece.style.setProperty("--y", `${-10 - Math.random() * 35}%`);
      piece.style.setProperty("--drift", `${Math.random() * 180 - 90}px`);
      piece.style.setProperty("--rotation", `${Math.random() * 360}deg`);
      piece.style.setProperty("--duration", `${2.1 + Math.random() * 2.2}s`);
      piece.style.setProperty("--confetti-color", colors[index % colors.length]);
      celebrationLayer.append(piece);
    }
    burstHearts(window.innerWidth / 2, window.innerHeight * 0.38, 22);
    window.setTimeout(() => celebrationLayer.replaceChildren(), 5200);
  }

  function showResult(result) {
    const screenByResult = {
      yes: "yes-screen",
      no: "no-screen",
      chance: "chance-screen",
      friends: "friends-screen"
    };
    const target = screenByResult[result];
    if (!target) return;
    playEffect(result === "yes" || result === "chance" ? "yes" : result === "friends" ? "friends" : "no");
    showScreen(target);
    sendAnswer(result);
    if (result === "yes" || result === "chance") celebrateConfession();
  }

  async function sendAnswer(result) {
    const resultScreen = document.getElementById({
      yes: "yes-screen",
      no: "no-screen",
      chance: "chance-screen",
      friends: "friends-screen"
    }[result]);
    const status = resultScreen.querySelector("[data-email-status]");
    const retryButton = resultScreen.querySelector("[data-retry-email]");
    if (status.dataset.sending === "true") return;
    const answerText = {
      yes: "Yes! They said they like you too.",
      no: "No, thank you. They chose the honest no option.",
      chance: "They'll give you a chance.",
      friends: "They'd like to be friends."
    }[result];
    status.dataset.sending = "true";
    status.textContent = "Sending your answer…";
    retryButton.hidden = true;
    retryButton.dataset.answer = result;

    try {
      const response = await fetch(emailEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          _subject: "A confession website answer",
          answer: answerText,
          selected_at: new Date().toISOString()
        })
      });
      const data = await response.json();
      if (!response.ok || (data.success !== true && data.success !== "true")) {
        throw new Error("The email service did not accept the answer.");
      }
      status.textContent = "Your answer was sent by email. Thank you for sharing honestly.";
    } catch (error) {
      console.error("Could not send the selected answer by email:", error);
      status.textContent = "Your answer is shown here, but the email could not be sent. Check your connection and try again.";
      retryButton.hidden = false;
    } finally {
      status.dataset.sending = "false";
    }
  }

  function burstHearts(x, y, count = 7) {
    const colors = ["#e87994", "#d46c8d", "#efa6b5", "#d89d73"];
    for (let index = 0; index < count; index += 1) {
      const heart = document.createElement("span");
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.4;
      const distance = 42 + Math.random() * 75;
      heart.className = "burst-heart";
      heart.textContent = Math.random() > 0.25 ? "♥" : "♡";
      heart.style.setProperty("--x", `${x}px`);
      heart.style.setProperty("--y", `${y}px`);
      heart.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
      heart.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
      heart.style.setProperty("--turn", `${Math.random() * 100 - 50}deg`);
      heart.style.setProperty("--size", `${0.8 + Math.random() * 1.1}rem`);
      heart.style.setProperty("--heart-color", colors[index % colors.length]);
      celebrationLayer.append(heart);
      heart.addEventListener("animationend", () => heart.remove(), { once: true });
    }
  }

  function openLetter() {
    if (openingTimer) return;
    playEffect("open");
    envelope.classList.add("is-open");
    const rect = envelope.getBoundingClientRect();
    burstHearts(rect.left + rect.width / 2, rect.top + rect.height / 2, 14);
    announce("Your letter is opening.");
    openingTimer = window.setTimeout(() => {
      showScreen("letter-screen");
      openingTimer = undefined;
    }, 420);
  }

  function dodgeNoButton() {
    const now = Date.now();
    if (now - lastDodgeAt < 430) return;
    lastDodgeAt = now;
    dodgeCount += 1;
    playEffect("dodge");

    const rect = noButton.getBoundingClientRect();
    const margin = 20;
    const width = noButton.offsetWidth;
    const height = noButton.offsetHeight;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    const yesRect = document.querySelector("#yes-button").getBoundingClientRect();
    let left = margin;
    let top = margin;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      left = margin + Math.random() * (maxLeft - margin);
      top = margin + Math.random() * (maxTop - margin);
      const overlapsYes = left < yesRect.right + 24 && left + width > yesRect.left - 24
        && top < yesRect.bottom + 24 && top + height > yesRect.top - 24;
      if (!overlapsYes) break;
    }

    if (!noButton.classList.contains("is-dodging")) {
      noButton.classList.add("is-dodging");
      noButton.style.left = `${rect.left}px`;
      noButton.style.top = `${rect.top}px`;
      noButton.getBoundingClientRect();
    }
    noButton.style.left = `${left}px`;
    noButton.style.top = `${top}px`;
    noButton.style.transform = `rotate(${Math.random() * 6 - 3}deg)`;

    dodgeMessage.textContent = playfulMessages[messageIndex % playfulMessages.length];
    messageIndex += 1;
    announce(`The no button dodged. ${dodgeMessage.textContent}`);
    if (dodgeCount >= 4 && challenge.hidden) {
      challenge.hidden = false;
      announce("HAHAHA, YOU REALLY TRIED! One last question: will you give me a chance?");
    }
  }

  openButton.addEventListener("click", openLetter);

  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => {
      playEffect("page");
      showScreen(button.dataset.go);
    });
  });

  document.querySelectorAll("[data-result]").forEach((button) => {
    button.addEventListener("click", () => showResult(button.dataset.result));
  });

  document.querySelectorAll("[data-retry-email]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.answer) sendAnswer(button.dataset.answer);
    });
  });

  document.querySelector("#yes-button").addEventListener("click", () => showResult("yes"));

  noButton.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse" || event.pointerType === "pen") dodgeNoButton();
  });

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (pendingTouchDodge && event.target !== noButton) {
        pendingTouchDodge = false;
        window.clearTimeout(pendingTouchDodgeTimer);
      }
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      if (!pendingTouchDodge || event.detail === 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      pendingTouchDodge = false;
      window.clearTimeout(pendingTouchDodgeTimer);
    },
    true,
  );

  noButton.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") {
      event.preventDefault();
      pendingTouchDodge = true;
      window.clearTimeout(pendingTouchDodgeTimer);
      pendingTouchDodgeTimer = window.setTimeout(() => {
        pendingTouchDodge = false;
      }, 1000);
      dodgeNoButton();
    }
  });

  noButton.addEventListener("click", (event) => {
    if (event.detail === 0) {
      honestOptions.hidden = false;
      honestToggle.setAttribute("aria-expanded", "true");
      document.querySelector('[data-result="no"]').focus();
      announce("Choose honestly options are now available.");
      return;
    }
    dodgeNoButton();
  });

  document.querySelector(".envelope-wrap").addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") {
      const rect = envelope.getBoundingClientRect();
      burstHearts(rect.left + rect.width / 2, rect.top + rect.height / 2, 3);
    }
  });

  document.querySelector("#yes-button").addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") {
      playEffect("hover");
      const rect = event.currentTarget.getBoundingClientRect();
      burstHearts(rect.left + rect.width / 2, rect.top + rect.height / 2, 5);
    }
  });

  honestToggle.addEventListener("click", () => {
    const expanded = honestToggle.getAttribute("aria-expanded") === "true";
    honestToggle.setAttribute("aria-expanded", String(!expanded));
    honestOptions.hidden = expanded;
    if (!expanded) document.querySelector('[data-result="no"]').focus();
  });

  window.addEventListener("resize", () => {
    if (noButton.classList.contains("is-dodging")) {
      const rect = noButton.getBoundingClientRect();
      const margin = 20;
      const left = Math.min(rect.left, window.innerWidth - noButton.offsetWidth - margin);
      const top = Math.min(rect.top, window.innerHeight - noButton.offsetHeight - margin);
      noButton.style.left = `${Math.max(margin, left)}px`;
      noButton.style.top = `${Math.max(margin, top)}px`;
    }
  });
})();
