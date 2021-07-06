/** 
 *  @fileOverview JavaScript for the visible browser window
 *
 *  @author       Ryan Zhang
 *
 *  @license      MIT
 *  @requires     lib/vue.js
 *  @requires     lib/luxon.min.js
 *  @requires     lib/localforage.min.js
 */

let questions = false; 

/**
 * Open source Fisher-Yates shuffle algorithm. 
 * Licensed under Apache-2.0. See apache.txt for a full copy of the license. 
 * Source: https://github.com/Daplie/knuth-shuffle
 * NOTE: This algorithm has been modified to ensure that arrays of size n>2 will never output an identical array to ensure the user will always have to change something for an "order" type question. 
 * 
 * @param {array} array - input array to shuffle
 * @returns {array} - shuffled array
 */
function shuffle(array) {
  let original = [...array]; // Duplicate array to ensure shuffling gives a different output
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  if (array.length > 2 && original[0] === array[0] && original[1] === array[1]) {
    return shuffle(array); // Shuffle again
  }
  return array;
}

/**
 * Data used in Vue app
 * @namespace Vue
 */
const appData = {
  el: '#app', 
  data: {
    page: 'landing', 
    dialog: false, 
    options: {
      quizType: 0 // 0 = all random, 1 = demo mode (five hardcoded questions)
    }, 
    quiz: {
      questions: [], // list of questions to be used in current quiz
      current: 0, // index in quiz.questions that's currently active
      review: false, // review mode disables editing answers and shows correct answers
      timeTaken: 0 // how much time was taken (in ms) on the quiz
    }, 
    exp: { // "export" is a reserved keyword, so we're going to use "exp" instead
      color: true, 
      showQuestion: true, 
      showOptions: true, 
      showAnswer: true, 
      showResponses: true
    }, 
    streak: {
      days: 0, 
      doneToday: false, 
      image: ''
    }, 
    quizHistory: false
  }, 
  methods: {
    /**
     * Generates a new five question quiz and navigates the user to the quiz page
     * @param {number} [quizType=this.options.quizType] Type of quiz to generate, where 0 = all random and 1 = fixed (using questions 1, 11, 21, 31, and 41)
     * @returns {undefined}
     */
    generateQuiz: function(quizType=this.options.quizType) {
      this.quiz.questions = []; // Clear any existing quiz questions
      let qout = []; // Array of questions [number, representing index of question] to add into this.quiz.questions
      if (quizType === 0) {
        // Pick five questions at random, without replacement
        while (qout.length < 5) {
          let qnum = Math.floor(Math.random() * questions.length); 
          // Ensure that we don't get duplicate questions
          if (qout.indexOf(qnum) === -1) {
            qout.push(qnum); 
          }
        }
      } else {
        // Use five cherry-picked questions (ensures one of each type)
        qout = [0, 10, 20, 30, 40]
      }
      // Obtain the questions at the selected indexes, and shuffle the answers if needed
      for (let i of qout) {
        let question = Object.assign({}, questions[i]); // Copy the question so that we don't modify the original
        question.sel = ''; // Selected option is, by default, nothing
        if (question.options) {
          // If options are present, shuffle them
          question.options = shuffle(question.options); 
        }
        this.quiz.questions.push(question); // Push the question to the array
      }
      timer.start(); // Start the timer
      this.quiz.review = false; // Quiz mode, not review mode
      this.quiz.current = 0; //Navigate to first question
      this.dialog = false; // Close dialog
      this.page = 'quiz'; // Open quiz
    }, 
    /**
     * "Submits" the quiz. Doing so will perform three actions: 
     * - Prevent the quiz from being edited any further, switching to "review" mode
     * - Grades the quiz 
     * - Saves the quiz results to IndexedDB
     * @returns {undefined}
     */
    submitQuiz: function() {
      timer.stop(); // Stop the timer
      this.quiz.review = true; // Enter review (read only) mode
      this.quiz.current = 0; 
      let numCorrect = 0, numTotal = 0; 
      for (let question of this.quiz.questions) {
        let correct; 
        switch (question.type) {
          case 'mc': 
            correct = question.sel === question.answer; 
            break; 
          case 'sa': 
          case 'n': 
            correct = question.sel.toLowerCase() === question.answer.toLowerCase(); 
            break; 
          case 'tf': 
            correct = (question.sel === 1 && question.answer === 'true') || (question.sel === 0 && question.answer === 'false'); 
            break; 
          case 'o': 
            correct = true; 
            for (let i = 0; i < question.options.length; i++) {
              if (question.answer[i] !== question.options[i]) {
                correct = false; 
                break; 
              }
            }
            break; 
        }
        question.correct = correct; 
        if (correct) numCorrect ++; 
        numTotal ++; 
      }
      this.quiz.stats = {
        date: this.formatTS(Date.now()), 
        time: this.quiz.timeTaken, 
        correct: numCorrect, 
        total: numTotal
      }; 
      this.saveQuiz(); 
    }, 
    /**
     * Saves the user's quiz to IndexedDB. 
     * @param {object} [data=this.quiz.questions] - array of questions to save
     * @param {*} [temporary=false] - whether to save as a permanent result (false) or in the temporary slot (true) to be continued later
     * @returns {undefined}
     */
    saveQuiz: async function(data=this.quiz, temporary=false) {
      let quizData = {
        ts: Date.now(), 
        questions: data.questions, 
        stats: data.stats
      }; 
      if (temporary) {
        // Use a special, synchronous "temporary" key for saving in-progress quizzes
        await localStorage.setItem('quizTemporary', quizData); 
        return; 
      }
      
      let res = await localforage.getItem('quizHistory');
      if (res) {
        // Append new quiz results to quiz results array if it already exists
        res.push(quizData); 
        await localforage.setItem('quizHistory', res); 
      } else {
        // Otherwise, create a new quiz results array and set the first item to our results
        await localforage.setItem('quizHistory', [quizData]); 
      }
      this.updateQuizHistory(); 
    }, 
    /**
     * Async wrapper for fetching quiz history. 
     * @returns {undefined}
     */
    updateQuizHistory: async function() {
      this.quizHistory = await localforage.getItem('quizHistory'); 
      this.updateStreak(); // update streak information
    }, 
    /**
     * Given a "code" for a question type, returns the name of said question type. 
     * @param {string} code - mc, sa, o, n, or tf
     * @returns {string} name of acronym
     */
    getQuestionType: function(code) {
      switch (code) {
        case 'mc': 
          return 'Multiple Choice'; 
        case 'sa': 
          return 'Short Answer'; 
        case 'o': 
          return 'Ordering'; 
        case 'n': 
          return 'Numerical';
        case 'tf': 
          return 'True/False'; 
        default: 
          return 'Unknown'; 
      }
    }, 
    /**
     * Formats a question answer in a human-readable way
     * @param {string} answer from question.answer
     */
    formatAnswer: function(answer) {
      if (answer === 'true') {
        return 'True'; 
      } else if (answer === 'false') {
        return 'False'
      } else if (Array.isArray(answer)) {
        return answer.join(', '); 
      } else {
        return answer.toString(); 
      }
    }, 
    /**
     * Method that's called when a draggable object (from ordering questions) is selected
     * @param {object} event - the native event object
     * @param {string} index - the index of the element being dragged
     * @returns {undefined}
     */
    onDrag: function(event, index) {
      event.dataTransfer.setData('item', index); 
    }, 
    /**
     * Method that's called when a draggable object is released on another element
     * @param {object} event - the native event object
     * @param {string} index - the index of the target element (what's the item being dropped onto?)
     * @returns {undefined}
     */
    onDrop: function(event, index) {
      if (this.currentQuestion.sel === 1) {
        return; 
      }
      let src = parseInt(event.dataTransfer.getData('item')), dest = parseInt(index); 
      // Switch the two around!
      let cqo = this.currentQuestion.options; // Current question options (to perform a swap on)
      let temp = cqo[src];
      cqo[src] = cqo[dest]; 
      cqo[dest] = temp; 
      this.$forceUpdate(); // Update what's displayed
    },
    /**
     * Performs an action under the Quiz History page
     * @param {number} index - index of quiz in this.quizHistory
     * @param {number} type - 0, 1, or 2 for "review", "export", and "delete" respectively
     */ 
    qh: function(index, type) {
      let target = this.quizHistory[index]; 
      switch (type) {
        case 0: 
          this.quiz.questions = target.questions; 
          this.quiz.stats = target.stats; 
          this.quiz.review = true; // Review mode
          this.page = 'quiz'; // Open quiz
          return; 
        case 1: 
          this.quiz.questions = target.questions; 
          this.quiz.stats = target.stats; 
          this.quiz.review = true; // Review mode
          this.page = 'quiz-export'; // Open quiz
          return; 
      }
    },
    /**
     * Calculates the streak of the user and updates the text on the streaks page as needed. Does not return anything. 
     * @returns {undefined}
     */
    updateStreak: function() {
      // Obtain timestamps of each quiz in reverse chronological order. 
      let ts = app.quizHistory.reverse().map(r => r.ts); 
      let streak = 0, index = 0; 
      while (index < ts.length) {
        let day = luxon.DateTime.local().startOf('day').minus({days: streak + 1}); 
        dt = luxon.DateTime.fromMillis(ts[index]); 
        if (luxon.Interval.fromDateTimes(day, day.plus({days: 1})).contains(dt)){
          streak ++; 
        }
        index ++; 
      }
      let doneToday = luxon.Interval.fromDateTimes(luxon.DateTime.local().startOf('day'), luxon.DateTime.local().startOf('day').plus({days: 1})).contains(luxon.DateTime.fromMillis(ts[0])); 
      if (doneToday) streak ++; 
      this.streak.days = streak; 
      this.streak.doneToday = doneToday; 
      this.streak.image = (streak === 0 ? 'images/unhappy.png' : (streak <= 3 ? 'images/happy.png' : 'images/veryhappy.png'));
    }, 
    /**
     * Formats a unix timestamp in a human-readable format
     * @param {number} ts - timestamp, in milliseconds
     */
    formatTS: function (ts) {
      return luxon.DateTime.fromMillis(ts).toLocaleString(luxon.DateTime.DATETIME_MED); 
    }, 
    /**
     * Returns the time taken on a specific quiz formated as m:ss. 
     * @returns {string} 
     */ 
     getFormattedTime: function () {
      let seconds; 
      if (this.quiz.review) {
        seconds = this.quiz.stats && this.quiz.stats.time ? Math.floor(this.quiz.stats.time/1000) : 0; // Saved time 
      } else {
        seconds = Math.floor(this.quiz.timeTaken/1000); // # of seconds taken
      }
      return `${Math.floor(seconds/60)}:${(seconds%60).toString().padStart(2, '0')}`; 
    }, 
    /**
     * Opens an external link
     * @param {string} url
     */
    openExternal: function (url) {
      ipcRenderer.send('open-external', url); 
    },
    /**
     * Prompts if the user really wishes to exit the quiz. 
     */ 
    confirmExit: function () {
      ipcRenderer.send('prompt-for-quiz-exit');
    }
  }, 
  computed: {
    /**
     * Alias for the currently selected question object.
     * Setter is provided for changing properties. 
     * @returns {object} question - the current question
     */
    currentQuestion: {
      get: function () {
        let question = this.quiz.questions[this.quiz.current]; 
        question.index = this.quiz.current; // question index
        return question; 
      }, 
      set: function (question) {
        this.quiz.questions[this.quiz.current] = question; 
      }
    }, 
    /**
     * Object that indicates whether data validation has passed (questions must all be answered AND no invalid input is provided)
     * @returns {object} {ready: (boolean), missing: (string)}
     */
    readyToSubmit: function () {
      let ready = true; 
      let missing = ''; 
      for (let i = 0; i < this.quiz.questions.length; i++) {
        if (typeof this.quiz.questions[i].sel === 'undefined' || this.quiz.questions[i].sel === '') {
          ready = false; 
          if (this.quiz.questions[i].type === 'o') {
            missing += `Question ${i+1} has not been locked in (by selecting "Done") yet.\r\n`
          } else {
            missing += `Question ${i+1} has not been answered yet.\r\n`
          }
        } else if (this.quiz.questions[i].type === 'n' && this.quiz.questions[i].sel !== parseInt(this.quiz.questions[i].sel).toString()) {
          // Not an integer
          ready = false; 
          missing += `Question ${i+1}'s response is not an integer.\r\n`
        }
      }
      return {
        ready, 
        missing
      }
    }
  }
}; 

const app = new Vue(appData); 

/**
 * The timer module is an optional sub-module that adds support for timing how long a user takes to complete a quiz. 
 * It has two public methods - @function timer.start() and @function timer.stop() - which start (from 0:00) and stop the timer respectively. 
 */
const timer = {
  _timeStart: 0, // Internal value denoting when the timer was started
  _updateInterval: false, // Internal value for the interval clock
  /**
   * @private
   * Internal function for updating the time taken variable every second when the timer is active. 
   * @returns {undefined}
   */
  _update: function() {
    app.quiz.timeTaken = Date.now() - timer._timeStart; 
  }, 
  /**
   * Starts a new timer instance (clearing the previous one, if applicable). 
   * @returns {undefined} 
   */
  start: function() {
    timer._timeStart = Date.now(); 
    timer._updateInterval = setInterval(timer._update, 1000); 
    app.quiz.timeTaken = 0; 
  }, 
  /**
   * Stops the timer instance and finalizes the time spent. 
   * @returns {undefined} 
   */
  stop: function() {
    clearInterval(timer._updateInterval); 
    timer._update(); 
  }
}

// Question array recieved
ipcRenderer.on('set-questions', (arg) => {
  questions = arg; 
  app.updateQuizHistory(); 
}); 

// User confirmed they'd like to exit the quiz early
ipcRenderer.on('quiz-exit', () => {
  app.page = "landing"; 
}); 

ipcRenderer.send('get-questions');

function exit() {
  ipcRenderer.send('prompt-for-exit');
}