[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/do3A9tGZ)
# JavaScript Fundamental Lab

## Overview
JavaScript (JS) is the programming language of the web. It makes websites dynamic and interactive. Almost every modern website uses JS to add behavior and functionality.

## Why JS in Web Development?
- Runs directly in the browser.
- Allows interaction with users and HTML elements.
- Used widely in front-end and back-end (Node.js).

## Using DevTools
- Open browser Developer Tools (F12 or **Ctrl+Shift+I** / **Cmd+Opt+I**).
- Select the **Console** tab.
- Use `console.log()` in your code to display outputs.

## JS in HTML
- **Inline/Embedded JS:** Written directly inside `<script>...</script>` tags in the HTML.
- **External JS:** Written in a `.js` file and linked with `<script src="file.js" defer></script>`.
- **Why external?** Keeps code organized, reusable, and easier to debug.

---

## Concepts — Syntax Guide
Below are short code syntax examples for each concept. These are **not lab solutions**, just references so you know the correct structure.

### Syntax & Variables
```js
let x = 5;        // block scoped, reassignable
var y = 10;       // function scoped, reassignable
const PI = 3.14;  // block scoped, cannot be reassigned
```

### Arithmetic & Types
```js
// Arithmetic operators
let sum = 2 + 3;
let diff = 5 - 1;
let product = 4 * 2;
let quotient = 10 / 2;
let remainder = 9 % 4;

// Number vs string with +
"2" + 3;   // "23"
2 + "3";   // "23"
2 + 3;     // 5
```

### Conditional Statements
```js
// if / else if / else
if (condition) {
  // code
} else if (otherCondition) {
  // code
} else {
  // code
}

// switch
switch (value) {
  case "A":
    // code
    break;
  case "B":
    // code
    break;
  default:
    // code
}
```

### Loops
```js
// for loop
for (let i = 0; i < 5; i++) {
  // code
}

// while loop
while (condition) {
  // code
}

// do-while loop
do {
  // code
} while (condition);
```

### Functions
```js
// function declaration
function greet(name) {
  return "Hello, " + name;
}

// function expression
const square = function(n) {
  return n * n;
};

// arrow function
const cube = n => n * n * n;
```

### Scope & Global Object
```js
if (true) {
  var a = 1; // function scoped
  let b = 2; // block scoped
  const c = 3; // block scoped
}
// a is accessible outside, b and c are not.
```

### Arrays
```js
let nums = [1, 2, 3];
nums.push(4);     // add at end
nums.pop();       // remove from end
nums.unshift(0);  // add at start
nums.shift();     // remove from start
```

---

## Taking User Input
In browsers, use `prompt()`:
```js
let name = prompt("Enter your name:");
console.log("Hello, " + name);
```

---

## Reading zyBooks
For deeper understanding, students must read the referenced **Chapter 4 topics** in zyBooks. These concepts will appear in quizzes. Lab tasks are simplified practice; zyBooks covers details.

---

## Checklist Before Submission
- [ ] Connected `script.js` in `index.html` correctly.
- [ ] Completed all TODO tasks in `script.js`.
- [ ] Used `console.log()` for outputs (no DOM code required).
- [ ] Code runs without syntax errors.

