const BTSerialPort = require( 'bluetooth-serial-port' );
const { sleep } = require( './util' );

const CONNECT_MAX_ATTEMPTS = 3;
const CONNECT_ATTEMPT_DELAY = 500;

class Bluetooth
{
	constructor( mac_address )
	{
		this._address = mac_address;
		this._btserial = new BTSerialPort.BluetoothSerialPort();
		this._connected = false;
	}

	/**
	 * Get the name and address of each paired Bluetooth device.
	 *
	 * @return {Promise<String[]>}
	 */
	get_devices()
	{
		return new Promise( resolve => {
			const format = device => `${device.name}: ${device.address.split( '-' ).join( ':' )}`;
			this._btserial.listPairedDevices( data => resolve( data.map( device => format( device ) ) ) );
		} );
	}

	/**
	 * Get the name and address of each paired Bluetooth device.
	 *
	 * @return {Promise<String[]>}
	 */
	is_connected()
	{
		return ( this._btserial.isOpen() );
	}

	/**
	 * Connect to the Divoom device.
	 *
	 * @param {String} address The bluetooth address of the Divoom device.
	 * @return {Promise<String>}
	 */
	async connect()
	{
		// Attempt to connect to the device
		const connectAttempt = () => new Promise( ( resolve, reject ) => {
			// Find the device
			this._btserial.findSerialPortChannel( this._address, channel => {
				// Connect to the device
				this._btserial.connect( this._address, channel, () => {
					// Log any data we get from the device
					this._btserial.on( 'data', buffer => {
						if ( buffer.length )
							console.log( `[${this._address}]: ${buffer.toString( 'ascii' )}` );
					} );

					// We connected, resolve
					this._connected = true;
					resolve( 'Connected' );
				}, () => reject( 'Cannot connect' ) );
			}, () => reject( 'Not found' ) );
		} );

		// Track connection attempts
		let attempts = 0;

		// Log a connection attempt
		const log = msg => console.log( `[${this._address}]: Connection ${attempts+1}/${CONNECT_MAX_ATTEMPTS}: ${msg}` );

		// Let's try connecting
		while ( attempts < CONNECT_MAX_ATTEMPTS )
		{
			try
			{
				const res = await connectAttempt();
				log( res );
				return ( res );
			}
			catch ( err )
			{
				log( err );
				++attempts;
				await sleep( CONNECT_ATTEMPT_DELAY );
			}
		}

		throw new Error( 'Could not connect' );
	};

	/**
	 * Write a buffer of data to the serial bluetooth connection.
	 *
	 * @param {Buffer} buffer The data buffer to send.
	 * @return {Promise<Buffer>}
	 */
	write( buffer )
	{
		return new Promise( ( resolve, reject ) => {
			this._btserial.write( buffer, ( err, bytes ) => err ? reject( err ) : resolve( bytes ) );
		} );
	}

	/**
	 * Close the connection to the Bluetooth device.
	 */
	close()
	{
		this._connected = false;
		return ( this._btserial.close() );
	}
}

module.exports.Bluetooth = Bluetooth;
