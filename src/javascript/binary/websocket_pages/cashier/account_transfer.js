const BinarySocket = require('../socket');
const Client       = require('../../base/client');
const localize     = require('../../base/localize').localize;
const FormManager  = require('../../common_functions/form_manager');

const AccountTransfer = (() => {
    'use strict';

    const form_id = '#frm_account_transfer';

    let accounts,
        $transfer;

    const populateAccounts = (response_transfer, response_limits) => {
        if (response_transfer.error || response_limits.error) {
            $('#error_message').find('p').text((response_transfer.error || response_limits.error).message).end()
                .setVisibility(1);
            return;
        }
        accounts = response_transfer.accounts;
        const client_loginid = Client.get('loginid');
        const $form = $(form_id);
        $transfer = $form.find('#transfer');
        let text,
            from_loginid,
            to_loginid,
            max_balance;

        accounts.forEach((account, idx) => {
            if (+account.balance) {
                from_loginid = accounts[idx].loginid;
                to_loginid = accounts[1 - idx].loginid;
                text = localize('from [_1] to [_2]', [from_loginid, to_loginid]);
                if (client_loginid === from_loginid) {
                    max_balance = Math.min(+accounts[idx].balance, +response_limits.get_limits.remainder);
                } else {
                    max_balance = +accounts[idx].balance;
                }
                $transfer.append($('<option/>', {
                    text           : text,
                    'data-from'    : from_loginid,
                    'data-to'      : to_loginid,
                    'data-currency': accounts[idx].currency,
                    'data-balance' : max_balance,
                }));
            }
        });

        // show client's login id on top
        const $client_option = $transfer.find(`option[data-from="${client_loginid}"]`);
        if ($client_option.length !== 0) {
            $client_option.insertBefore($transfer.find('option:eq(0)')).attr('selected', 'selected');
        }

        if (from_loginid) {
            showForm($form);
        } else {
            $('#client_message').setVisibility(1);
        }
    };

    const showForm = ($form) => {
        const $currency = $form.find('#currency');
        $transfer.on('change', function() {
            updateCurrency($currency, $(this));
            bindValidation();
        });
        updateCurrency($currency);
        $form.setVisibility(1);
        bindValidation();
        FormManager.handleSubmit({
            form_selector       : form_id,
            fnc_response_handler: responseHandler,
        });
    };

    const updateCurrency = ($currency) => { $currency.text(getTransferAttr('data-currency')); };

    const getTransferAttr = attribute => $transfer.find('option:selected').attr(attribute);

    const bindValidation = () => {
        FormManager.init(form_id, [
            { selector: '#amount', validations: ['req', ['number', { type: 'float', decimals: '1, 2', min: 0.1, max: getTransferAttr('data-balance'), custom_message: 'This amount exceeds your withdrawal limit.' }]] },

            { request_field: 'transfer_between_accounts', value: 1 },
            { request_field: 'account_from',              value: () => getTransferAttr('data-from') },
            { request_field: 'account_to',                value: () => getTransferAttr('data-to') },
            { request_field: 'currency',                  value: () => getTransferAttr('data-currency') },
        ]);
    };

    const responseHandler = (response) => {
        if (response.error) {
            $('#form_error').text(response.error.message).setVisibility(1);
        } else {
            BinarySocket.send({ transfer_between_accounts: 1 }).then(data => populateReceipt(data));
        }
    };

    const populateReceipt = (response) => {
        $(form_id).setVisibility(0);
        accounts = response.accounts;
        accounts.forEach((account, idx) => {
            $(`#loginid_${(idx + 1)}`).text(account.loginid);
            $(`#balance_${(idx + 1)}`).text(`${account.currency} ${account.balance}`);
        });
        $('#success_form').setVisibility(1);
    };

    const onLoad = () => {
        BinarySocket.send({ transfer_between_accounts: 1 }).then((response_transfer) => {
            BinarySocket.send({ get_limits: 1 }).then(response_limits =>
                populateAccounts(response_transfer, response_limits));
        });
    };

    return {
        onLoad: onLoad,
    };
})();

module.exports = AccountTransfer;
