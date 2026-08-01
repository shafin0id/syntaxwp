import apiFetch from '@wordpress/api-fetch';

// No manual root-URL/nonce middleware setup here: WordPress core already
// wires both up automatically for the 'wp-api-fetch' script on every
// wp-admin page (wp_default_packages_inline_scripts()), the moment it's
// enqueued as a dependency — which build/index.asset.php lists it as,
// since this file imports @wordpress/api-fetch.

export function getSettings() {
	return apiFetch( { path: '/syntaxwp/v1/settings', method: 'GET' } );
}

export function saveSettings( { siteId, siteSecret, apiBaseUrl } ) {
	return apiFetch( {
		path: '/syntaxwp/v1/settings',
		method: 'POST',
		data: { site_id: siteId, site_secret: siteSecret, api_base_url: apiBaseUrl },
	} );
}

export function disconnect() {
	return apiFetch( { path: '/syntaxwp/v1/settings/disconnect', method: 'POST' } );
}
