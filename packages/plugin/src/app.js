import { useEffect, useState } from '@wordpress/element';
import { getSettings } from './api';
import ConnectedPanel from './connected-panel';
import ConnectForm from './connect-form';
import MarketingCTA from './marketing-cta';

export default function App( { bootstrap } ) {
	const [ settings, setSettings ] = useState( {
		connected: bootstrap.connected,
		site_id: bootstrap.siteId,
		api_base_url: bootstrap.apiBaseUrl,
	} );

	// bootstrap already has the state as of page load — this re-fetches so
	// a stale cached page load (e.g. back-button) doesn't show a connect
	// state that's actually already been saved.
	useEffect( () => {
		getSettings().then( setSettings ).catch( () => {} );
	}, [] );

	return (
		<div className="syntaxwp-admin">
			<h1 className="syntaxwp-admin__title">SyntaxWP</h1>
			{ settings.connected ? (
				<ConnectedPanel settings={ settings } onChange={ setSettings } />
			) : (
				<>
					<MarketingCTA marketingUrl={ bootstrap.marketingUrl } />
					<ConnectForm defaultApiBaseUrl={ settings.api_base_url } onConnected={ setSettings } />
				</>
			) }
		</div>
	);
}
