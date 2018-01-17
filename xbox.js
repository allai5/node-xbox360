'use strict';
// require the module
var Xbox360Controller = require('./node-xbox360-controller.js');

// initialize the first controller (Player 1)
Xbox360Controller.init(0);

Xbox360Controller[0].on('connectionStateChange', function (state) {
    console.log('connectionState: %d', state);
    // example output (when a controller gets connected)
    // connectionState: 2
});

Xbox360Controller[0].on('ready', function (status) {
    console.log('Controller is ready (Battery: %s, Rechargeable: %s)', status.battery, (status.rechargeable ? 'yes' : 'no'));
    // example output
    // Controller is ready (Battery: 2, Rechargeable: yes)
});

Xbox360Controller[0].on('change:Xbox', function (pressed) {
    console.log('%s Xbox/guide button', (pressed ? 'Pressed' : 'Released'));
    // example output
    // Released Xbox/guide button
});

Xbox360Controller[0].on('move:StickLeft', function (position) {
    console.log('Left stick got moved, position is now: %j', position)
    // example output
    // Left stick got moved, position is now: {x: 853, y: -31784}
});

Xbox360Controller[0].on('move:StickRight', function (position) {
    console.log('Right stick got moved, position is now: %j', position)
    // example output
    // Left stick got moved, position is now: {x: 853, y: -31784}
});




/*
Complete output for
* starting node app
* turning on controller
* pressing the Xbox/guide button
* moving left stick
* pressing the Xbox/guide button
* turning off controller by removing battery

 connectionState: 2
 Controller is ready (Battery: 3, Rechargeable: yes)
 Pressed Xbox/guide button
 Released Xbox/guide button
 Left stick got moved, position is now: {"x":-5309,"y":-436}
 Left stick got moved, position is now: {"x":-5309,"y":-908}
 Pressed Xbox/guide button
 Released Xbox/guide button
 connectionState: 0
 */