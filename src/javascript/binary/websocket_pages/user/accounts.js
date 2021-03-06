const SubAccount   = require('./sub_account');
const BinarySocket = require('../socket');
const BinaryPjax   = require('../../base/binary_pjax');
const Client       = require('../../base/client');
const localize     = require('../../base/localize').localize;
const urlFor       = require('../../base/url').urlFor;
const State        = require('../../base/storage').State;
const toTitleCase  = require('../../common_functions/string_util').toTitleCase;

const Accounts = (() => {
    'use strict';

    let landing_company;

    const onLoad = () => {
        if (!Client.get('residence')) {
            // ask client to set residence first since cannot wait landing_company otherwise
            BinaryPjax.load(urlFor('user/settings/detailsws'));
        }
        BinarySocket.wait('landing_company', 'get_settings').then(() => {
            landing_company = State.getResponse('landing_company');

            populateExistingAccounts();

            let element_to_show = '#no_new_accounts_wrapper';
            const upgrade_info = Client.getUpgradeInfo(landing_company);
            if (upgrade_info.can_upgrade) {
                populateNewAccounts(upgrade_info);
                element_to_show = '#new_accounts_wrapper';
            }

            const authorize = State.getResponse('authorize');
            // only clients with omnibus flag set are allowed to create sub accounts
            if (authorize && authorize.allow_omnibus) {
                handleSubAccount(authorize);
            } else {
                doneLoading(element_to_show);
            }
        });
    };

    const doneLoading = (element_to_show) => {
        $(element_to_show).setVisibility(1);
        $('#accounts_loading').remove();
        $('#accounts_wrapper').setVisibility(1);
    };

    const populateNewAccounts = (upgrade_info) => {
        const new_account = upgrade_info;
        const account = {
            real     : new_account.type === 'real',
            financial: new_account.type === 'financial',
        };

        $('#new_accounts').find('tbody')
            .append($('<tr/>')
                .append($('<td/>', { text: localize(`${toTitleCase(new_account.type)} Account`) }))
                .append($('<td/>', { text: getAvailableMarkets(account) }))
                .append($('<td/>', { text: Client.getLandingCompanyValue(account, landing_company, 'legal_allowed_currencies').join(', ') }))
                .append($('<td/>')
                    .html($('<a/>', { class: 'button', href: urlFor(new_account.upgrade_link) })
                        .html($('<span/>', { text: localize('Create') })))));
    };

    const populateExistingAccounts = () => {
        Client.getAllLoginids()
            .sort((a, b) => a > b)
            .forEach((loginid) => {
                const account_currency = Client.get('currency', loginid);

                $('#existing_accounts').find('tbody')
                    .append($('<tr/>', { id: loginid })
                        .append($('<td/>', { text: loginid }))
                        .append($('<td/>', { text: localize(Client.getAccountTitle(loginid)) }))
                        .append($('<td/>', { text: getAvailableMarkets(loginid) }))
                        .append($('<td/>')
                            .html(!account_currency && loginid === Client.get('loginid') ? $('<a/>', { class: 'button', href: urlFor('user/set-currency') }).html($('<span/>', { text: localize('Set Currency') })) : account_currency || '-')));
            });
    };

    const getAvailableMarkets = (loginid) => {
        let legal_allowed_markets = Client.getLandingCompanyValue(loginid, landing_company, 'legal_allowed_markets') || '';
        if (Array.isArray(legal_allowed_markets) && legal_allowed_markets.length) {
            legal_allowed_markets =
                legal_allowed_markets
                    .map(market => getMarketName(market))
                    .filter((value, index, self) => value && self.indexOf(value) === index)
                    .join(', ');
        }
        return legal_allowed_markets;
    };

    const markets = {
        commodities: 'Commodities',
        forex      : 'Forex',
        indices    : 'Indices',
        stocks     : 'Stocks',
        volidx     : 'Volatility Indices',
    };

    const getMarketName = market => localize(markets[market] || '');

    const handleSubAccount = (authorize) => {
        const currencies = SubAccount.getCurrencies(authorize.sub_accounts, landing_company);
        if (!currencies.length) {
            doneLoading('#no_new_accounts_wrapper');
            return;
        }

        $('#new_accounts').find('tbody')
            .append($('<tr/>', { id: 'create_sub_account' })
                .append($('<td/>', { text: localize('Real Account') }))
                .append($('<td/>', { text: getAvailableMarkets({ real: 1 }) }))
                .append($('<td/>', { class: 'account-currency' }))
                .append($('<td/>').html($('<button/>', { text: localize('Create') }))));

        $('#note').setVisibility(1);

        const $create_sub_account = $('#create_sub_account');
        if (currencies.length > 1) {
            const $currencies = $('<div/>');
            $currencies.append($('<option/>', { value: '', text: localize('Please select') }));
            currencies.forEach((c) => {
                $currencies.append($('<option/>', { value: c, text: c }));
            });
            $create_sub_account.find('.account-currency').html($('<select/>', { id: 'sub_account_currency' }).html($currencies.html()));
        } else {
            $create_sub_account.find('.account-currency').html($('<span/>', { id: 'sub_account_currency', value: currencies, text: currencies }));
        }

        $create_sub_account.find('button').on('click', () => {
            if (!getSelectedCurrency()) {
                showError('Please choose a currency');
            } else {
                BinarySocket.send({ new_sub_account: 1 }).then((response) => {
                    if (response.error) {
                        const account_opening_reason = State.getResponse('get_settings.account_opening_reason');
                        if (response.error.code === 'InsufficientAccountDetails' && !account_opening_reason) {
                            // ask client to set account opening reason
                            BinaryPjax.load(`${urlFor('user/settings/detailsws')}#new-account`);
                        } else {
                            showError(response.error.message);
                        }
                    } else {
                        handleNewAccount(response);
                    }
                });
            }
        });

        doneLoading('#new_accounts_wrapper');
    };

    const getSelectedCurrency = () => {
        const sub_account_currency = document.getElementById('sub_account_currency');
        return sub_account_currency.value || sub_account_currency.getAttribute('value');
    };

    const handleNewAccount = (response) => {
        const new_account = response.new_sub_account;
        State.set('ignoreResponse', 'authorize');
        BinarySocket.send({ authorize: new_account.oauth_token }, { forced: true }).then((response_authorize) => {
            if (response_authorize.error) {
                showError(response_authorize.error.message);
            } else {
                BinarySocket
                    .send({ set_account_currency: getSelectedCurrency() })
                    .then((response_set_account_currency) => {
                        if (response_set_account_currency.error) {
                            showError(response_set_account_currency.error.message);
                        } else {
                            Client.processNewAccount({
                                email  : Client.get('email'),
                                loginid: new_account.client_id,
                                token  : new_account.oauth_token,
                            });
                        }
                    });
            }
            State.remove('ignoreResponse');
        });
    };

    const showError = (message) => {
        $('#new_account_error').remove();
        $('#create_sub_account').find('button').parent().append($('<p/>', { class: 'error-msg', id: 'new_account_error', text: localize(message) }));
    };

    return {
        onLoad: onLoad,
    };
})();

module.exports = Accounts;
