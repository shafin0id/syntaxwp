import { useState } from '@wordpress/element';
import { disconnect, saveSettings } from './api';

function maskSiteId( siteId ) {
	if ( siteId.length <= 8 ) {
		return siteId;
	}
	return `${ siteId.slice( 0, 4 ) }…${ siteId.slice( -4 ) }`;
}

export default function ConnectedPanel( { settings, onChange } ) {
	const [ apiBaseUrl, setApiBaseUrl ] = useState( settings.api_base_url );
	const [ saving, setSaving ] = useState( false );
	const [ disconnecting, setDisconnecting ] = useState( false );
	const [ error, setError ] = useState( '' );

	function handleSaveUrl( event ) {
		event.preventDefault();
		setError( '' );
		setSaving( true );

		// site_id/site_secret intentionally omitted: GET /settings never
		// returns the secret, so this can only ever change the URL — the
		// backend falls back to the already-stored id/secret when both are
		// left blank (see SettingsController::handlePost).
		saveSettings( { siteId: '', siteSecret: '', apiBaseUrl } )
			.then( () => onChange( { ...settings, api_base_url: apiBaseUrl } ) )
			.catch( ( err ) => setError( err.message || 'Could not save.' ) )
			.finally( () => setSaving( false ) );
	}

	function handleDisconnect() {
		if ( ! window.confirm( 'Disconnect this site from SyntaxWP? Monitoring and automatic fixes will stop.' ) ) {
			return;
		}
		setDisconnecting( true );
		disconnect()
			.then( () => onChange( { connected: false, site_id: '', api_base_url: apiBaseUrl } ) )
			.catch( ( err ) => setError( err.message || 'Could not disconnect.' ) )
			.finally( () => setDisconnecting( false ) );
	}

	return (
		<div className="syntaxwp-card">
			<h2>Connected</h2>
			<p>
				Site ID: <code>{ maskSiteId( settings.site_id ) }</code>
			</p>

			{ error && <p className="syntaxwp-error">{ error }</p> }

			<form onSubmit={ handleSaveUrl } className="syntaxwp-field-row">
				<label className="syntaxwp-field">
					API Base URL
					<input
						type="url"
						value={ apiBaseUrl }
						onChange={ ( e ) => setApiBaseUrl( e.target.value ) }
					/>
				</label>
				<button type="submit" className="syntaxwp-button" disabled={ saving }>
					{ saving ? 'Saving…' : 'Save' }
				</button>
			</form>

			<button
				type="button"
				className="syntaxwp-button syntaxwp-button--danger"
				onClick={ handleDisconnect }
				disabled={ disconnecting }
			>
				{ disconnecting ? 'Disconnecting…' : 'Disconnect site' }
			</button>
		</div>
	);
}
