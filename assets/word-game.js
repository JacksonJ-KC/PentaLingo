const letterPool = document.getElementById("letterPool");
const letterRack = document.getElementById("letterRack");
const gameBoard = document.getElementById("gameBoard");
const playButton = document.getElementById("playButton");
const scoreDisplay = document.getElementById("score");
const timeLeftDisplay = document.getElementById("timeLeft");
const bonusLetters = ["J", "K", "Q", "V", "X", "Z"];
const dragPop = new Audio('assets/audio/drag-pop.mp3');
const releasePop = new Audio('assets/audio/release-pop.mp3');
const errorSound = new Audio('assets/audio/error.mp3');
const gameOverSound = new Audio('assets/audio/game-over.mp3');

let score = 0;
let timer = null;
let countdownTimer = null;
let timeLeft = 300;
const letterSet = {
"A": 5,
"B": 3,
"C": 3,
"D": 3,
"E": 7,
"F": 2,
"G": 3,
"H": 3,
"I": 5,
"J": 1,
"K": 2,
"L": 3,
"M": 3,
"N": 4,
"O": 5,
"P": 3,
"Q": 1,
"R": 4,
"S": 4,
"T": 4,
"U": 3,
"V": 2,
"W": 2,
"X": 1,
"Y": 2,
"Z": 1
}
let queueTile = null;
let currentTile = null;

// Initialize the game board with empty cells
function initializeGameBoard() {
  const rows = 5; // Number of rows (words)
  const cellsPerRow = 10; // Number of cells per row
  gameBoard.innerHTML = ""; // Clear the board

  for (let i = 0; i < rows; i++) {
    const rowContainer = document.createElement("div");
    rowContainer.classList.add("row-container");

    const rowLabel = document.createElement("div");
    rowLabel.classList.add("row-label");
    rowLabel.textContent = `Word ${i + 1}`;

    const row = document.createElement("div");
    row.classList.add("row");
    row.setAttribute("data-row-index", i);

    for (let j = 0; j < cellsPerRow; j++) {
      const cell = document.createElement("div");
      cell.classList.add("cell", "empty");
      cell.setAttribute("data-letter", ""); // Initialize empty letter
      row.appendChild(cell);
    }

    const submitButton = document.createElement("button");
    submitButton.textContent = "Submit Word";
    submitButton.addEventListener("click", () => submitWord(row));

    rowContainer.appendChild(rowLabel);
    rowContainer.appendChild(row);
    rowContainer.appendChild(submitButton);
    gameBoard.appendChild(rowContainer);
  }

  setupDragAndDrop(); // Ensure cells are ready for drag-and-drop
}

function initializePool() {
  letterPool.innerHTML = ""; // Clear the pool

  // Iterate through the letterSet and generate the specified number of tiles for each letter
  for (const [letter, count] of Object.entries(letterSet)) {
    for (let i = 0; i < count; i++) {
      const tile = createTile(letter);
      letterPool.appendChild(tile);
    }
  }

  // Optionally shuffle the pool for randomness
  shufflePool();
}

// Shuffle the tiles in the letter pool for randomness
function shufflePool() {
  const tiles = Array.from(letterPool.children);
  letterPool.innerHTML = ""; // Clear the pool temporarily
  while (tiles.length) {
    const randomIndex = Math.floor(Math.random() * tiles.length);
    letterPool.appendChild(tiles.splice(randomIndex, 1)[0]); // Append a random tile back
  }
}

// Create a tile element
function createTile(letter) {
  const tile = document.createElement("div");
  tile.classList.add("cell");
  if (bonusLetters.includes(letter)) {
    tile.classList.add("bonus");
  }
  tile.textContent = letter;
  tile.setAttribute("data-letter", letter);
  tile.draggable = true;

  // Drag event listeners
  tile.addEventListener("dragstart", handleDragStart);
  tile.addEventListener("dragend", handleDragEnd);

  return tile;
}

function handleDragStart(event) {
  const validParents = [letterRack, discardPile]; // Allow dragging from both the letterRack and discardPile

  if (!validParents.includes(event.target.parentElement)) {
    event.preventDefault(); // Prevent dragging from invalid parents
    return;
  }
  dragPop.play();
  event.dataTransfer.setData("text/plain", event.target.getAttribute("data-letter"));
  currentTile = event.target; // Keep track of the dragged tile
  setTimeout(() => {
    event.target.style.display = "none"; // Hide the dragged tile for visual feedback
  }, 0);
}

// Handle drag end
function handleDragEnd(event) {
  // Restore visibility after dragging ends
  event.target.style.display = "";
}

// Allow dropping on the farthest left empty cell in each row
function setupDragAndDrop() {
  const rows = document.querySelectorAll(".row");
  const discardPile = document.getElementById("discardPile");

  // Set up drag-and-drop for each row
  rows.forEach(row => {
    row.addEventListener("dragover", event => {
      const firstEmptyCell = findFirstEmptyCell(row);
      if (firstEmptyCell) {
        event.preventDefault(); // Allow dropping only if there is an empty cell
        firstEmptyCell.classList.add("drag-over"); // Highlight the first empty cell
      }
    });

    row.addEventListener("dragleave", () => {
      // Remove drag-over class from all empty cells to avoid inconsistency
      row.querySelectorAll(".cell.empty").forEach(cell => cell.classList.remove("drag-over"));
    });

    row.addEventListener("drop", event => {
      const firstEmptyCell = findFirstEmptyCell(row);
      const allRows = document.querySelectorAll(".row"); // Adjust selector for your rows
      const firstCellsFilled = Array.from(allRows).every(row => {
        const firstCell = row.querySelector(".cell"); // Adjust selector for first cell
        return firstCell && firstCell.classList.contains("filled");
      });

      // Check if the first empty cell is not the first cell
      const firstCellInRow = row.querySelector(".cell");
      const isDroppingBeyondFirstCell = firstEmptyCell !== firstCellInRow;

      // Enforce the rule
      if (isDroppingBeyondFirstCell && !firstCellsFilled) {
        errorSound.play();
        // Prevent the drop and notify the user (optional)
        alert("You must place the first letter of all words first!");
        return;
      }

      // Proceed with the drop
      if (firstEmptyCell && currentTile) {
        releasePop.play();
        const letter = event.dataTransfer.getData("text/plain");

        // Update the cell with the dropped letter
        firstEmptyCell.textContent = letter;
        firstEmptyCell.setAttribute("data-letter", letter);
        firstEmptyCell.classList.remove("empty", "drag-over");
        firstEmptyCell.classList.add("filled");
        if (bonusLetters.includes(letter)) {
            firstEmptyCell.classList.add("bonus");
        }

        // Ensure a new tile is drawn after a valid drop
        if (queueTile === currentTile) {
          queueTile = null; // Reset queueTile
          drawTile();
        }

        // Remove the tile from the rack
        currentTile.remove();
        currentTile = null;

        // Make the next latest discarded tile draggable
        const discardedTiles = Array.from(discardPile.children);
        discardedTiles.forEach((tile, index) => {
          tile.draggable = index === discardedTiles.length - 1; // Only make the first tile draggable
        });
      }
    });
  });

  // Set up drag-and-drop for the discard pile
  discardPile.addEventListener("dragover", event => {
    event.preventDefault(); // Allow dropping into the discard pile
  });

  discardPile.addEventListener("drop", event => {
    releasePop.play();
    event.preventDefault();

    if (currentTile) {
      // Move the current tile to the discard pile
      discardPile.append(currentTile);

      // Ensure only the first (newest) tile is draggable
      const discardedTiles = Array.from(discardPile.children);
      discardedTiles.forEach((tile, index) => {
        tile.draggable = index === discardedTiles.length - 1; // Only make the first tile draggable
      });

      queueTile = null; // Reset queueTile
      drawTile(); // Draw a new tile after valid discard
      currentTile = null;
    }
  });

  discardPile.addEventListener("dragstart", event => {
    currentTile = event.target;
    dragPop.play();
  });

  discardPile.addEventListener("dragend", event => {
    // Handle cases where a tile is dragged out of the discard pile but not dropped
    if (currentTile && currentTile.parentElement !== discardPile) {
      currentTile.remove();
      currentTile = null;
      releasePop.play();

      // Update draggability for remaining tiles in the discard pile
      const discardedTiles = Array.from(discardPile.children);
      discardedTiles.forEach((tile, index) => {
        tile.draggable = index === discardedTiles.length - 1; // Ensure the first tile remains draggable
      });
    }
  });
}

// Find the first empty cell in a row
function findFirstEmptyCell(row) {
  return Array.from(row.children).find(cell => cell.classList.contains("empty"));
}

// Start the game
function startGame() {
  resetGame();
  startCountdown();
  timer = setInterval(() => {
    if (!queueTile) {
      drawTile();
    }
  }, 50);
}

// Draw a tile from the pool
function drawTile() {
  if (letterPool.children.length > 0) {
    const tile = letterPool.firstChild;
    queueTile = tile;
    letterRack.appendChild(tile);
    console.log("Tile drawn:", tile);
  } else {
    clearInterval(timer);
    alert("No more tiles in the pool!");
    endGame();
  }
}

// Submit a word for a specific row
async function submitWord(row) {
  const cells = Array.from(row.children);
  const word = cells
    .map(cell => cell.getAttribute("data-letter") || "")
    .join("");

  if (word.trim().length < 4) {
    alert("Word must be at least 4 letters long!");
    return;
  }

  // Validate the word
  const isValid = await validateWord(word);

  if (isValid) {
    // Basic points for completing a word
    let wordScore = 1; // +1 for a completed word

    // Points for letters beyond 4 in the word
    if (word.length > 4) {
      wordScore += word.length - 4;
    }

    // Bonus points for specific letters
    word.split("").forEach(letter => {
      if (bonusLetters.includes(letter.toUpperCase())) {
        wordScore += 3; // +3 for each bonus letter
      }
    });

    // Update the total score
    score += wordScore;
    scoreDisplay.textContent = score;

    // Clear the row
    cells.forEach(cell => {
      cell.textContent = "";
      cell.setAttribute("data-letter", "");
      cell.classList.remove("filled");
      cell.classList.remove("bonus");
      cell.classList.add("empty");
    });

  } else {
    errorSound.play();
    alert(`"${word}" is not a valid word!`);
  }
}

function calculateDiscardPenalties() {
  const discardPile = document.getElementById("discardPile");
  const unusedLetters = discardPile.children.length;
  const penalty = -unusedLetters; // -1 point per unused letter

  // Update the total score
  score += penalty;
  scoreDisplay.textContent = score;

  return penalty;
}

// Countdown timer logic
function startCountdown() {
  timeLeft = 300;
  updateTimerDisplay();

  countdownTimer = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();

    if (timeLeft <= 0) {
      clearInterval(countdownTimer);
      clearInterval(timer);
      endGame();
    }
  }, 1000);
}

function updateTimerDisplay() {
  timeLeftDisplay.textContent = timeLeft;
}

// Reset the game
function resetGame() {
  clearInterval(timer); // Clear the tile drawing timer
  clearInterval(countdownTimer); // Clear the countdown timer
  currentTile = null; // Reset the current tile
    queueTile = null; // Reset the queue tile
  score = 0; // Reset the score
  timeLeft = 300; // Reset the timer
  scoreDisplay.textContent = score; // Update the score display
  timeLeftDisplay.textContent = timeLeft; // Update the timer display

  // Clear the letterRack and discardPile
  letterRack.innerHTML = ""; // Clear all tiles from the rack
  discardPile.innerHTML = ""; // Clear all tiles from the discard pile

  // Reinitialize the game
  initializePool(); // Reset the letter pool
  initializeGameBoard(); // Reset the game board
}

// Set up event listeners
function setupEventListeners() {
  playButton.addEventListener("click", startGame);
}

// Initialize the game
initializePool();
initializeGameBoard();
setupEventListeners();


async function validateWord(word) {
  const apiUrl = `https://api.datamuse.com/words?sp=${word}&max=1`;

  try {
    const response = await fetch(apiUrl);
    const data = await response.json();

    // Check if the word exists in the dictionary
    if (data.length > 0 && data[0].word.toLowerCase() === word.toLowerCase()) {
      return true; // The word exists
    }
    return false; // The word does not exist
  } catch (error) {
    console.error("Error validating word:", error);
    return false; // Return false if there's an error
  }
}

function endGame() {
  clearInterval(countdownTimer);
  clearInterval(timer);

  // Calculate penalties for unused letters
  const penalty = calculateDiscardPenalties();
  gameOverSound.play();
  alert(`Game over! Final Score: ${score} (Discard penalty: ${penalty} points)`);
}
