// CTRL+Z > kill $(jobs -p | cut -d' ' -f 4) && fg

const fs = require( 'fs' );
const DecodeGIF = require( 'decode-gif' );

const { Bluetooth } = require( './lib/bluetooth' );
const { rjust, sleep, resize, noalpha, getpixel, hexlify, unhexlify } = require( './lib/util' );

class Pixoo
{
	CMD_SET_SYSTEM_BRIGHTNESS = 0x74;
	CMD_SET_SYSTEM_DATETIME = 0x18;
	CMD_SET_SYSTEM_CLIMATE = 0x5F;
	CMD_SET_SYSTEM_FULLDAY = 0x2D;
	CMD_SPP_SET_USER_GIF = 0xB1;
	CMD_DRAWING_ENCODE_PIC = 0x5B;

	BOX_MODE_CLOCK = 0x00;
	BOX_MODE_TEMP = 0x01;
	BOX_MODE_COLOR = 0x02;
	BOX_MODE_EFFECTS = 0x03;
	BOX_MODE_EQUALIZER = 0x04;
	BOX_MODE_STOPWATCH = 0x06;
	BOX_MODE_SCOREBOARD = 0x07;

	BOX_VISUAL_CLOCK_US = 0x00;
	BOX_VISUAL_CLOCK_ISO = 0x01;
	BOX_VISUAL_TEMP_DEGREES = 0x00;
	BOX_VISUAL_TEMP_FAHRENHEIT = 0x01;

	_size = 16;

	constructor( mac_address )
	{
		this._last = { path: '', encoded: '', raw: null, data: null };
		this._delay = { enabled: false, timeout: 0 };
		this._btsock = new Bluetooth( mac_address );
		this._update = null;
		this._address = mac_address;
	}

	__little_hex( num )
	{
		return ( [ ( num & 0xFF ), ( ( num >> 8 ) & 0xFF ) ] )
	}

	__spp_frame_checksum( args )
	{
		return ( args.slice( 1 ).reduce( ( a, b ) => a + b, 0 ) & 0xFFFF );
	}

	__spp_frame_encode( cmd, args )
	{
		let payload_size = ( args.length + 3 );

		// create our header
		let frame_header = [ 0x01, ...this.__little_hex( payload_size ), cmd ];

		// concatenate our args (byte array)
		let frame_buffer = frame_header.concat( args );

		// compute checksum (first byte excluded)
		let cs = this.__spp_frame_checksum( frame_buffer );

		// create our suffix (including checksum)
		let frame_suffix = [ ...this.__little_hex( cs ), 0x02 ];

		// return output buffer
		return ( frame_buffer.concat( frame_suffix ) );
	}

	async __send( cmd, args )
	{
		let spp_frame = this.__spp_frame_encode( cmd, args );
		if ( this._btsock.is_connected() )
			await this._btsock.write( new Buffer.from( spp_frame ) );
	}

	connect()
	{
		return new Promise( ( resolve, reject ) => {
			if ( this.connected() )
				return ( resolve( [ this, 'Already connected' ] ) );

			this._btsock.connect( this._address )
				.then( msg => {
					resolve( [ this, msg ] );
				} )
				.catch( msg => reject( [ this, msg ] ) );
		} );
	}

	connected()
	{
		return ( this._btsock.is_connected() );
	}

	close()
	{
		try
		{
			this._btsock.close();
			console.log( `\r[${this._address}]: Disonnected` );
		}
		catch ( e ) {}
	}

	get_last_frame()
	{
		let name = this._last.encoded;
		if ( !this._last.raw || typeof( this._last.raw[ name ] ) === 'undefined' )
			return ( null );

		let [ palette, pixel_data, pixels, length, timecode, speed ] = this._last.raw[ name ];

		let timecodes = [];
		if ( this._last.data )
		{
			this._last.data.frames.forEach( frame => {
				timecodes.push( frame.timeCode );
			} );
		}

		return ( [ palette, [ pixels ], ( speed ? speed : timecodes ) ] );
	}

	set_update_callback( callback )
	{
		this._update = callback;
	}

	stop_delay()
	{
		this._delay.enabled = false;
		clearTimeout( this._delay.timeout );
	}

	clear_frame( pixel = { r: 0, g: 0, b: 0, a: 0 } )
	{
		let data = [];
		for ( let y = 0; y < this._size; ++y )
		{
			for ( let x = 0; x < this._size; ++x )
				data.push( pixel );
		}

		// reset last datas
		let name = 'clear';
		this._last.path = name;
		this._last.data = null;
		this._last.raw = {};

		// encode frame
		this._last.raw[ name ] = this.encode_raw_image( {
			speed:		0,
			width:		this._size,
			height:		this._size,
			length:		1,
			data:		data,
			timecode:	0
		} );
		this._last.encoded = name;
		let [ palette, pixel_data, pixels, length, timecode, speed ] = this._last.raw[ name ];
		let frame = this.encode_frame( palette, pixel_data );

		// send animation
		this.__send( 0x44, [ 0x00, 0x0A, 0x0A, 0x04 ].concat( frame ) );
		if ( this._update )
			this._update( palette, [ pixels ] );
	}

	set_system_brightness( brightness )
	{
		this.__send( this.CMD_SET_SYSTEM_BRIGHTNESS, [ ( brightness & 0xFF ) ] );
	}

	set_system_climate( temperature, weather )
	{
		if ( temperature < 0 )
			temperature = ( 256 + temperature );

		this.__send( this.CMD_SET_SYSTEM_CLIMATE, [ ( temperature & 0xFF ), ( weather & 0xFF ) ] );
	}

	set_system_datetime( date, mode )
	{
		let year = date.getFullYear();
		this.__send( this.CMD_SET_SYSTEM_DATETIME, [
			( year % 100 ), parseInt( year / 100 ),
			( date.getMonth() + 1 ),
			date.getDate(),
			date.getHours(),
			date.getMinutes(),
			date.getSeconds(),
			0x00
		] );

		if ( typeof( mode ) !== 'undefined' )
			pixoo.set_box_mode( Pixoo.BOX_MODE_CLOCK, mode );
	}

	set_system_fullday( mode )
	{
		this.__send( this.CMD_SET_SYSTEM_FULLDAY, [ ( mode & 0xFF ) ] );
	}

	set_box_mode( boxmode, visual = 0x00 )
	{
		let data = [ ( boxmode & 0xFF ), ( visual & 0xFF ) ];
		for ( let arg in [ ...arguments ].slice( 2 ) )
			data.push( arg & 0xFF );

		this.__send( 0x45, data );
	}

	set_color( r, g, b )
	{
		this.__send( 0x6F, [ ( r & 0xFF ), ( g & 0xFF ), ( b & 0xFF ) ] );
	}

	encode_image( filepath, index = 0, subindex = 0 )
	{
		let data = null;
		if ( filepath != this._last.path || !this._last.data )
		{
			data = DecodeGIF( fs.readFileSync( filepath ) );

			let multi = 0;
			for ( let frame of data.frames )
			{
				if ( !multi )
					multi = ( frame.data.length / ( data.width * data.height ) );

				let pixels = [];
				for ( let i = 0; i < frame.data.length; i += multi )
				{
					pixels.push( {
						r:	frame.data[ i ],
						g:	frame.data[ i + 1 ],
						b:	frame.data[ i + 2 ],
						a:	( ( multi == 4 ) ? frame.data[ i + 3 ] : 255 )
					} );
				}

				frame.data = pixels;
			}

			this._last.path = filepath;
			this._last.data = data;
			this._last.raw = {};
		}
		else
			data = this._last.data;

		let tindex = ( index.toString() + '-' + subindex.toString() );
		if ( typeof( this._last.raw[ tindex ] ) === 'undefined' )
		{
			let speed = 100;
			if ( data.frames.length >= 2 )
				speed = ( data.frames[ 1 ].timeCode - data.frames[ 0 ].timeCode );

			this._last.raw[ tindex ] = this.encode_raw_image( {
				speed:		speed,
				width:		data.width,
				height:		data.height,
				length:		data.frames.length,
				data:		data.frames[ index ].data,
				timecode:	data.frames[ index ].timeCode
			} );
		}

		this._last.encoded = tindex;
		return ( this._last.raw[ tindex ] );
	}

	encode_raw_image( img )
	{
		// ensure image is square
		if ( img.width != img.height )
			throw new Error( 'Image must be square !' );

		// resize if image is too big
		if ( img.width != this._size )
		{
			img = resize( img, this._size );
			if ( !img )
				throw new Error( 'Please choose an image with a multiple resolution of 16x16 !' );
		}

		// create palette and pixel array
		let pixels = [];
		let palette = [];
		for ( let y of [ ...Array( this._size ).keys() ] )
		{
			for ( let x of [ ...Array( this._size ).keys() ] )
			{
				let r, g, b;
				let pixel = img.data[ ( y * this._size ) + x ];
				[ r, g, b ] = [ pixel.r, pixel.g, pixel.b ];

				let idx = -1;
				for ( let i = 0; i < palette.length; ++i )
				{
					if ( JSON.stringify( palette[ i ] ) == JSON.stringify( [ r, g, b ] ) )
					{
						idx = i;
						break ;
					}
				}

				if ( idx < 0 )
				{
					palette.push( [ r, g, b ] );
					idx = ( palette.length - 1 );
				}

				pixels.push( idx );
			}
		}

		let display = ( '\r╔' + '═══'.repeat( this._size ).substr( 1 ) + '╗\n' );
		for ( let y of [ ...Array( img.height ).keys() ] )
		{
			let line = [];
			for ( let x of [ ...Array( img.width ).keys() ] )
				line.push( ( '0' + hexlify( pixels[ ( y * img.width ) + x ] ) ).slice( -2 ).replace( /0/g, ' ' ) );
			display += ( '\r║' + line.join( '.' ) + '║\n' );
		}
		display += ( '\r╚' + '═══'.repeat( this._size ).substr( 1 ) + '╝' );
		console.log( `\r[${this._address}]: Display {${palette.length},${pixels.length}}\n${display}` );

		// encode pixels
		let bitwidth = Math.ceil( Math.log10( palette.length ) / Math.log10( 2 ) );
		let nbytes = Math.ceil( ( 256 * bitwidth ) / 8. );
		let encoded_pixels = new Array( nbytes ).fill().map( () => 0 );

		encoded_pixels = [];
		let encoded_byte = '';
		for ( let i of pixels )
		{
			encoded_byte = rjust( i.toString( 2 ), bitwidth, '0' ) + encoded_byte;
			if ( encoded_byte.length >= 8 )
			{
				encoded_pixels.push( encoded_byte.slice( -8 ) );
				encoded_byte = encoded_byte.slice( 0, -8 );
			}
		}

		let encoded_data = [];
		for ( let c of encoded_pixels )
			encoded_data.push( parseInt( c, 2 ) );

		let encoded_palette = [];
		for ( let color of palette )
			encoded_palette.push( color );

		if ( encoded_palette.length > 256 )
			throw new Error( 'The color pallet cannot exceed 256 colors !' );

		return ( [ encoded_palette, encoded_data, pixels, img.length, img.timecode, img.speed ] );
	}

	encode_frame( palette, pixel_data, timecode = 0x00, reset_palette = false )
	{
		let size = ( 7 + pixel_data.length + palette.length );
		let header = [
			0xAA,
			...this.__little_hex( size ),
			...this.__little_hex( timecode ),
			( reset_palette ? 0x01 : 0x00 ),
			( ( palette.length == 256 ) ? 0x00 : palette.length )
		];

		let frame = header;
		for ( let color of palette )
			frame = frame.concat( color );
		frame = frame.concat( pixel_data );

		return ( frame );
	}

	draw_gif( filepath, sent, speed = 0, loop = true, index = 0 )
	{
		if ( Array.isArray( filepath ) )
			filepath = filepath[ 0 ];

		console.log( `\r[${this._address}]: SEND GIF`, filepath, speed );

		index = 0;
		let len = 1;
		let frames = [];
		let timecode = 0;
		let stop = ( e, v ) => {
			if ( sent )
				sent( e, v );

			sent = undefined;
		};

		try
		{
			// encode frames
			let pixel_datas = [];
			do
			{
				let palette, pixel_data, notimecode, nospeed;
				[ palette, pixel_data, pixels, len, notimecode, nospeed ] = this.encode_image( filepath, index );
				let frame = this.encode_frame( palette, pixel_data, timecode );

				frames = frames.concat( frame );
				timecode += ( speed ? speed : notimecode );

				pixel_datas.push( pixels );
			}
			while ( ++index < len );

			// send animation
			let nchunks = Math.ceil( len / 200. );
			for ( let i of [ ...Array( nchunks ).keys() ] )
			{
				let chunk = [ ...this.__little_hex( len ), i ];
				this.__send( 0x49, chunk.concat( frames.slice( ( i * 200 ), ( ( i + 1 ) * 200 ) ) ) );
				if ( this._update )
					this._update( palette, pixel_datas );

				stop( false );
			}
		}
		catch ( error ) { stop( error ); }
	}

	draw_anim( filepaths, sent, speed = 0, loop = true, index = 0 )
	{
		console.log( `\r[${this._address}]: SEND ANIM`, filepaths, speed );

		index = 0;
		let len = filepaths.length;
		let frames = [];
		let timecode = 0;
		let stop = ( e, v ) => {
			if ( sent )
				sent( e, v );

			sent = undefined;
		};

		try
		{
			// encode frames
			let pixel_datas = [];
			do
			{
				let [ palette, pixel_data, pixels, nolen, notimecode, nospeed ] = this.encode_image( filepaths[ index ], 0, index );
				let frame = this.encode_frame( palette, pixel_data, timecode );

				frames = frames.concat( frame );
				timecode += ( speed ? speed : 100 );

				pixel_datas.push( pixels );
			}
			while ( ++index < len );

			// send animation
			let nchunks = Math.ceil( len / 200. );
			for ( let i of [ ...Array( nchunks ).keys() ] )
			{
				let chunk = [ ...this.__little_hex( len ), i ];
				this.__send( 0x49, chunk.concat( frames.slice( ( i * 200 ), ( ( i + 1 ) * 200 ) ) ) );
				if ( this._update )
					this._update( palette, pixel_datas );

				stop( false );
			}
		}
		catch ( error ) { stop( error ); }
	}

	draw_gif_delay( filepath, sent, speed = 0, loop = true, index = 0 )
	{
		if ( !( typeof( arguments[ 5 ] ) === 'boolean' && arguments[ 5 ] ) )
		{
			this._delay.enabled = false;
			clearTimeout( this._delay.timeout );
			this._delay = { enabled: true, timeout: 0 };
		}

		if ( Array.isArray( filepath ) )
			filepath = filepath[ 0 ];

		index = 0;
		let length = 1;
		let stop = ( e, v ) => {
			this._delay.enabled = false;
			clearTimeout( this._delay.timeout );
			if ( sent )
				sent( e, v );

			sent = undefined;
		};
		let next = () => {
			if ( !this._delay.enabled || index >= length )
			{
				if ( this._delay.enabled && loop )
					this.draw_gif_delay( filepath, sent, speed, loop, 0, true );
				else
					stop( false );

				return ;
			}

			this.draw_pic( filepath, ( error, nolength, nospeed ) => {
				if ( error )
					return ( stop( error ) );

				length = nolength;
				if ( !speed )
					speed = nospeed;

				index += 1;
				this._delay.timeout = setTimeout( next, speed );
			}, undefined, undefined, index );
		};

		try { next(); }
		catch ( error ) { stop( error ); }
	}

	draw_anim_delay( filepaths, sent, speed = 0, loop = true, index = 0 )
	{
		if ( !( typeof( arguments[ 5 ] ) === 'boolean' && arguments[ 5 ] ) )
		{
			this._delay.enabled = false;
			clearTimeout( this._delay.timeout );
			this._delay = { enabled: true, timeout: 0 };
		}

		index = 0;
		let length = filepaths.length;
		let stop = ( e, v ) => {
			this._delay.enabled = false;
			clearTimeout( this._delay.timeout );
			if ( sent )
				sent( e, v );

			sent = undefined;
		};
		let next = () => {
			if ( !this._delay.enabled || index >= length )
			{
				if ( this._delay.enabled && loop )
					this.draw_anim_delay( filepaths, sent, ( speed || 100 ), loop, 0, true );
				else
					stop( false );

				return ;
			}

			this.draw_pic( filepaths[ index ], ( error, nolength, nospeed ) => {
				if ( error )
					return ( stop( error ) );

				//length = nolength;
				//if ( !speed )
				//	speed = nospeed;

				index += 1;
				this._delay.timeout = setTimeout( next, speed );
			} );
		};

		try { next(); }
		catch ( error ) { stop( error ); }
	}

	draw_pic( filepath, sent, speed = 0, loop = true, index = 0, subindex = 0 )
	{
		if ( Array.isArray( filepath ) )
			filepath = filepath[ 0 ];

		console.log( `\r[${this._address}]: SEND PIC`, filepath, ( index ? index : '' ) );

		let stop = ( e, l, s ) => {
			if ( sent )
				sent( e, l, s );

			sent = undefined;
		};

		try
		{
			// encode frame
			let [ palette, pixel_data, pixels, length, timecode, speed ] = this.encode_image( filepath, index, subindex );
			let frame = this.encode_frame( palette, pixel_data );

			// send animation
			this.__send( 0x44, [ 0x00, 0x0A, 0x0A, 0x04 ].concat( frame ) );
			if ( this._update )
				this._update( palette, [ pixels ] );

			stop( false, length, speed )
		}
		catch( error ) { stop( error ); }
	}
}

if ( require.main === module )
{
	var args = process.argv.slice( 1 );
	if ( args[ 0 ] == __filename )
		args = args.slice( 1 );

	let man = false;
	var mode = '';
	var files = [];
	var scale = 1;
	var speed = 0;
	var noloop = false;
	var address = '';
	try
	{
		for ( var i = 0; !man && i < args.length; ++i )
		{
			let key = args[ i ];
			if ( key[ 0 ] != '-' || files.length )
			{
				man = !fs.existsSync( args[ i ] );
				if ( !man )
					files.push( args[ i ] );

				continue ;
			}

			switch ( key )
			{
				case '-a':
				case '--address':
					tmp = args[ ++i ];
					if ( tmp.length == 17 )
						address = tmp;
					break ;

				case '-m':
				case '--mode':
					tmp = args[ ++i ];
					if ( tmp.indexOf( 'draw_' ) == 0 && typeof( Pixoo.prototype[ tmp ] ) === 'function' )
						mode = tmp;
					break ;

				case '-s':
				case '--speed':
					tmp = args[ ++i ];
					if ( parseInt( tmp ) == tmp && tmp >= 0 )
						speed = parseInt( tmp );
					break ;

				case '--x':
				case '--scale':
					tmp = args[ ++i ];
					if ( parseInt( tmp ) == tmp && tmp >= 1 )
						scale = parseInt( tmp );
					break ;

				case '--noloop':
					noloop = true;
					break ;

				default:
					if ( !mode || !address )
						man = true;
			}
		}
	}
	catch( error ) {}

	if ( man || !mode || !address || !files.length )
	{
		let node = process.execPath.split( '/' ).slice( -1 )[ 0 ].split( '\\' ).slice( -1 )[ 0 ];
		let script = __filename.split( '/' ).slice( -1 )[ 0 ].split( '\\' ).slice( -1 )[ 0 ];

		console.log( `pixoo: Usage: ${node} ${script} -a 00:00:00:00:00:00 -m draw_pic -s 100 image.gif` );
		process.exit( 1 );
	}

	const pixoo = new Pixoo( address );
	process.on( 'SIGINT', () => {
		pixoo.close();
		process.exit();
	} );

	//pixoo.size = 32;
	//pixoo.size = ( 16 * scale );
	pixoo.connect().then( () => {
		pixoo[ mode ]( files, error => { if ( error ) console.log( error ); pixoo.close(); }, speed, !noloop );
	} );
}
else
	module.exports.Pixoo = Pixoo
