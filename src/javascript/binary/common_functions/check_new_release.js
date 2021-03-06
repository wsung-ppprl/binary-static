const moment       = require('moment');
const urlForStatic = require('../base/url').urlForStatic;

// only reload if it's more than 10 minutes since the last reload
const shouldForceReload = last_reload => !last_reload || +last_reload + (10 * 60 * 1000) < moment().valueOf();

// calling this method is handled by GTM tags
const check_new_release = () => {
    const last_reload = localStorage.getItem('new_release_reload_time');
    if (!shouldForceReload(last_reload)) return false;
    localStorage.setItem('new_release_reload_time', moment().valueOf());
    const currect_hash = ($('script[src*="binary.min.js"],script[src*="binary.js"]').attr('src') || '').split('?')[1];
    const xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = () => {
        if (+xhttp.readyState === 4 && +xhttp.status === 200) {
            const latest_hash = xhttp.responseText;
            if (latest_hash && currect_hash && latest_hash !== currect_hash) {
                window.location.reload(true);
            }
        }
    };
    xhttp.open('GET', urlForStatic(`version?${Math.random().toString(36).slice(2)}`), true);
    xhttp.send();
    return true;
};

module.exports = {
    shouldForceReload: shouldForceReload,
    check_new_release: check_new_release,
};
