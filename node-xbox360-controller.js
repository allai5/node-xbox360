"user strict";

var Events = require('events');
var Util = require('util');
var USB = require('usb');
var statusReg = {
    init: false,
    controllerInit: [false, false, false, false]
};
var device = {
    receiver: false,
    controller: [false, false, false, false]
};
var controllerStatusReg = [];


function init() {
    device.receiver = USB.findByIds(0x045e, 0x0291);
    if (!device.receiver) {
        throw 'Unable to find Xbox 360 wireless receiver!';
    }

    device.receiver.open();

    statusReg.init = true;
    return true;
}

function initController(id) {
    if (typeof id !== 'number' || id < 0 || id > 3) {
        throw 'Invalid controller id (allowed is a number between 0 and 3)';
    }
    if (statusReg.controllerInit[id]) {
        return true;
    }

    if (!statusReg.init) {
        init();
    }

    controllerStatusReg[id] = {
        connection: 0,
        ready: false,
        rechargeable: false,
        battery: 0,
        state: {
            btnDPadUp: false,
            btnDPadDown: false,
            btnDPadLeft: false,
            btnDPadRight: false,
            btnA: false,
            btnB: false,
            btnX: false,
            btnY: false,
            btnBack: false,
            btnXbox: false,
            btnStart: false,
            btnStickLeft: false,
            btnStickRight: false,
            btnBumperLeft: false,
            btnBumperRight: false,

            stickLeft: {x: 0, y: 0},
            stickRight: {x: 0, y: 0},
            triggerLeft: 0,
            triggerRight: 0
        }
    };


    device.controller[id] = {};
    device.controller[id].data = device.receiver.interfaces[(id * 2)];
    device.controller[id].audio = device.receiver.interfaces[(id * 2 + 1)];

    //console.log(device.controller[id].data.isKernelDriverActive());

    var driverAttached = false;
    if (device.controller[id].data.isKernelDriverActive()) {
        driverAttached = true;
        device.controller[id].data.detachKernelDriver()
    }

    device.controller[id].data.claim();
    device.controller[id].dataIn = device.controller[id].data.endpoints[0];
    device.controller[id].dataOut = device.controller[id].data.endpoints[1];

    /*device.controller[id].audio.claim();
     device.controller[id].audioIn = device.controller[id].audio.endpoints[0];
     device.controller[id].audioOut = device.controller[id].audio.endpoints[1];*/

    device.controller[id].dataIn.on('data', function (buffer) {
        processControllerData(id, buffer);
    });
    device.controller[id].dataIn.startPoll(5, 32);

    //turnOffController(id);

    setInterval(function(){
        requestControllerStatus(id);
    }, 2000);

    statusReg.controllerInit[id] = true;
    return true;
}

function checkBitmask(data, bitMask) {
    return ((data & bitMask) === bitMask);
}

function processControllerData(id, buffer) {
    var type = buffer.readUInt16BE(0);

    switch (type) {
        case 0x0001: // state update

            var buttons = buffer.readUInt16BE(6);

            var newState = {
                btnDPadUp: checkBitmask(buttons, 0x0100),
                btnDPadDown: checkBitmask(buttons, 0x0200),
                btnDPadLeft: checkBitmask(buttons, 0x0400),
                btnDPadRight: checkBitmask(buttons, 0x0800),
                btnA: checkBitmask(buttons, 0x0010),
                btnB: checkBitmask(buttons, 0x0020),
                btnX: checkBitmask(buttons, 0x0040),
                btnY: checkBitmask(buttons, 0x0080),
                btnBack: checkBitmask(buttons, 0x2000),
                btnXbox: checkBitmask(buttons, 0x0004),
                btnStart: checkBitmask(buttons, 0x1000),
                btnStickLeft: checkBitmask(buttons, 0x4000),
                btnStickRight: checkBitmask(buttons, 0x8000),
                btnBumperLeft: checkBitmask(buttons, 0x0001),
                btnBumperRight: checkBitmask(buttons, 0x0002),

                stickLeft: {x: buffer.readInt16LE(10), y: buffer.readInt16LE(12)},
                stickRight: {x: buffer.readInt16LE(14), y: buffer.readInt16LE(16)},
                triggerLeft: buffer.readUInt8(8),
                triggerRight: buffer.readUInt8(9)
            };

            emitControllerStateChangeEvents(id, newState);
            controllerStatusReg[id].state = newState;
            break;
        case 0x0000: // info update
            if(controllerStatusReg[id].connection === 0){
                // we cant get info updates before there is a connection, if we get them maybe the controller was
                // already turned on before the application got started
                // we connection state should get received every 2 seconds, so we are going to get the correct data
                // in a few moments, just wait this short period
                return;
            }

            var data = buffer.readUInt16BE(3);

            if(data === 0xf000 || ((data & 0xfb31) !== 0x1320)){ // ignore this command
                return;
            }

            var wasReady = controllerStatusReg[id].ready;
            var wasBattery = controllerStatusReg[id].battery;

            controllerStatusReg[id].ready = !checkBitmask(data, 0x0004);
            controllerStatusReg[id].battery = ((data & 0x00C0) >> 6);
            controllerStatusReg[id].rechargeable = !checkBitmask(data, 0x0002);

            if (!wasReady && controllerStatusReg[id].ready) {
                setControllerLed(id, -1);
                setControllerRumble(id, 0, 0);
                module.exports[id].emit('ready', controllerStatusReg[id]);
            }
            if (wasReady && wasBattery !== controllerStatusReg[id].battery) {
                emitControllerEvent(id, 'battery', controllerStatusReg[id].battery);
            }
            break;
        case 0x0800: // disconnected
            if(controllerStatusReg[id].connection === 0){
                return;
            }
            controllerStatusReg[id].connection = 0;
            controllerStatusReg[id].ready = false;
            emitControllerEvent(id, 'connectionStateChange', 0);
            break;
        case 0x0840: // headset connected
            if(controllerStatusReg[id].connection === 1){
                return;
            }
            controllerStatusReg[id].connection = 1;
            emitControllerEvent(id, 'connectionStateChange', 1);
            break;
        case 0x0880: // controller connected
            if(controllerStatusReg[id].connection === 2){
                return;
            }
            controllerStatusReg[id].connection = 2;
            emitControllerEvent(id, 'connectionStateChange', 2);
            break;
        case 0x08c0: // controller and headset connected
            controllerStatusReg[id].connection = 3;
            if(controllerStatusReg[id].connection === 3){
                return;
            }
            emitControllerEvent(id, 'connectionStateChange', 3);
            break;
    }
}

function emitControllerEvent(id, event, value) {
    module.exports[id].emit(event, value, controllerStatusReg[id]);
}

function emitControllerStateChangeEvents(id, newState) {
    if (!controllerStatusReg[id].ready) {
        // dont emit events while controller is starting
        return;
    }
    emitControllerEvent(id, 'stateChange', newState);

    var buttonNames = [
        'DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight',
        'A', 'B', 'X', 'Y',
        'Back', 'Xbox', 'Start',
        'StickLeft', 'StickRight',
        'BumperLeft', 'BumperRight'
    ];

    buttonNames.forEach(function (buttonName) {
        var buttonKey = 'btn' + buttonName;
        if (controllerStatusReg[id].state[buttonKey] !== newState[buttonKey]) {
            module.exports[id].emit('change:' + buttonName, newState[buttonKey], controllerStatusReg[id]);
            if (newState[buttonKey]) {
                module.exports[id].emit('press:' + buttonName, controllerStatusReg[id]);
            } else {
                module.exports[id].emit('release:' + buttonName, controllerStatusReg[id]);
            }
        }
    });

    ['Left', 'Right'].forEach(function (drift) {
        var stickName = 'Stick' + drift;
        var stickKey = 'stick' + drift;
        var triggerName = 'Trigger' + drift;
        var triggerKey = 'trigger' + drift;

        var stick = controllerStatusReg[id].state[stickKey];
        if (stick.x !== newState[stickKey].x || stick.y !== newState[stickKey].y) {
            module.exports[id].emit('move:' + stickName, newState[stickKey], controllerStatusReg[id]);

            if (controllerStatusReg[id].state[stickKey].x !== newState[stickKey].x) {
                module.exports[id].emit('moveX:' + stickName, newState[stickKey].x, controllerStatusReg[id]);
            }
            if (controllerStatusReg[id].state[stickKey].y !== newState[stickKey].y) {
                module.exports[id].emit('moveY:' + stickName, newState[stickKey].y, controllerStatusReg[id]);
            }
        }

        if (controllerStatusReg[id].state[triggerKey] !== newState[triggerKey]) {
            module.exports[id].emit('move:' + triggerName, newState[triggerKey], controllerStatusReg[id]);
        }
    });
}


function requestControllerStatus(id){
    device.controller[id].dataOut.transfer(new Buffer([0x08, 0x00, 0x0f, 0xc0]));
    if(controllerStatusReg[id].connection > 0){
        device.controller[id].dataOut.transfer(new Buffer([0x00, 0x00, 0x00, 0x40]));
    }
}

function setControllerRumble(id, l, s) {
    var data = new Buffer([0x00, 0x01, 0x0f, 0xc0, 0x00, l, s, 0x00, 0x00, 0x00, 0x00, 0x00]);
    device.controller[id].dataOut.transfer(data);
    return true;
}

function setControllerLed(id, state) {
    if (state === -1) {
        state = (0x06 + id);
    }
    if (state < 0x00 || state > 0x0d) {
        return false;
    }
    var data = new Buffer([0x00, 0x00, 0x08, (0x40 + state), 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    device.controller[id].dataOut.transfer(data);
}

function turnOffController(id){
    var data = new Buffer([0x00, 0x00, 0x08, 0xc0]);
    device.controller[id].dataOut.transfer(data);
}


var controllerExport = function (id) {
    Events.EventEmitter.call(this);

    this.controllerId = id;

    this.getData = function () {
        return controllerStatusReg[this.controllerId];
    };
    this.setRumble = function (l, s) {
        return setControllerRumble(this.controllerId, l, s);
    };
    this.setLed = function (state) {
        return setControllerLed(this.controllerId, state);
    };
    this.turnOff = function(){
        turnOffController(this.controllerId);
    };
    this.requestStateUpdate = function(){
        requestControllerStatus(this.controllerId);
    }
    this.writeRaw = function(data){
        device.controller[this.controllerId].dataOut.transfer(data);
    }
};
Util.inherits(controllerExport, Events.EventEmitter);

module.exports.init = initController;
module.exports[0] = new controllerExport(0);
module.exports[1] = new controllerExport(1);
module.exports[2] = new controllerExport(2);
module.exports[3] = new controllerExport(3);