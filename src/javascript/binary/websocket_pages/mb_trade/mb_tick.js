const MBDefaults      = require('./mb_defaults');
const MBNotifications = require('./mb_notifications');
const BinarySocket    = require('../socket');

/*
 * MBTick object handles all the process/display related to tick streaming
 *
 * We request tick stream for particular underlying to update current spot
 *
 *
 * Usage:
 * use `MBTick.detail` to populate this object
 *
 * then use
 *
 * `MBTick.quote()` to get current spot quote
 * 'MBTick.display()` to display current spot
 */

const MBTick = (() => {
    'use strict';

    let quote = '',
        error_message = '';

    const details = (data) => {
        error_message = '';

        if (data) {
            if (data.error) {
                error_message = data.error.message;
            } else {
                quote = data.tick.quote;
            }
        }
    };

    const display = () => {
        $('#spot').fadeIn(200);
        const spot_element = document.getElementById('spot');
        if (!spot_element) return;
        let message = '';
        if (error_message) {
            message = error_message;
        } else {
            message = quote;
        }

        if (parseFloat(message) !== +message) {
            spot_element.className = 'error';
        } else {
            spot_element.classList.remove('error');
            displayPriceMovement(parseFloat(spot_element.textContent), parseFloat(message));
        }

        spot_element.textContent = message;
    };

    /*
     * Display price/spot movement variation to depict price moved up or down
     */
    const displayPriceMovement = (old_value, current_value) => {
        const class_name = (current_value > old_value) ? 'up' : (current_value < old_value) ? 'down' : 'still';
        const $spot = $('#spot');
        $spot.removeClass('up down still').addClass(class_name);
    };

    const request = (symbol) => {
        BinarySocket.send({
            ticks_history: symbol,
            style        : 'ticks',
            end          : 'latest',
            subscribe    : 1,
        }, { callback: processTickHistory });
    };

    const processTickHistory = (response) => {
        if (response.msg_type === 'tick') {
            if (response.hasOwnProperty('error')) {
                MBNotifications.show({ text: response.error.message, uid: 'TICK_ERROR' });
                return;
            }
            const symbol = MBDefaults.get('underlying');
            if (response.echo_req.ticks === symbol || (response.tick && response.tick.symbol === symbol)) {
                details(response);
                display();
            }
        } else if (response.history && response.history.times && response.history.prices) {
            for (let i = 0; i < response.history.times.length; i++) {
                details({
                    tick: {
                        epoch: response.history.times[i],
                        quote: response.history.prices[i],
                    },
                });
            }
        }
    };

    return {
        details     : details,
        display     : display,
        request     : request,
        quote       : ()  => quote,
        errorMessage: ()  => error_message,
        setQuote    : (q) => { quote = q; },
        clean       : ()  => {
            quote = '';
            const $spot = $('#spot');
            $spot.fadeOut(200, () => {
                // resets spot movement coloring, will continue on the next tick responses
                $spot.removeClass('up down').text('');
            });
        },
        displayPriceMovement: displayPriceMovement,
        processTickHistory  : processTickHistory,
    };
})();

module.exports = MBTick;
