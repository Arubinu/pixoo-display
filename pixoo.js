// CTRL+Z > kill $(jobs -p | cut -d' ' -f 4) && fg

const fs = require( 'fs' );
const DecodeGIF = require( 'decode-gif' );

const { getDevices, connect, write, close } = require( './lib/bluetooth' );
const { rjust, sleep, resize, noalpha, getpixel, hexlify, unhexlify } = require( './lib/util' );

class Pixoo
{
	CMD_SET_SYSTEM_BRIGHTNESS = 0x74;
	CMD_SPP_SET_USER_GIF = 0xB1;
	CMD_DRAWING_ENCODE_PIC = 0x5B;

	BOX_MODE_OFF = 0x99;
	BOX_MODE_CLOCK = 0x00;
	BOX_MODE_TEMP = 0x01;
	BOX_MODE_COLOR = 0x02;
	BOX_MODE_SPECIAL = 0x03;
	BOX_MODE_EQUALIZER = 0x03;

	BOX_VISUAL_CLOCK_US = 0x00;
	BOX_VISUAL_CLOCK_ISO = 0x01;
	BOX_VISUAL_TEMP_DEGREES = 0x00;
	BOX_VISUAL_TEMP_FAHRENHEIT = 0x01;

	size = 16;
	last = { path: '', raw: null, data: null };

	constructor( mac_address )
	{
		this.btsock = undefined;
		this.mac_address = mac_address;
	}

	connect()
	{
		var promise = connect( this.mac_address );
		this.btsock = true;
		return ( promise );
	}

	close()
	{
		try
		{
			close();
			console.log( '\r[LOCAL]: Disonnected' );
		}
		catch ( e ) {}
	}

	__spp_frame_checksum( args )
	{
		return ( args.slice( 1 ).reduce( ( a, b ) => a + b, 0 ) & 0xFFFF );
	}

	__spp_frame_encode( cmd, args )
	{
		let payload_size = ( args.length + 3 );

		// create our header
		let frame_header = [ 1, ( payload_size & 0xFF ), ( ( payload_size >> 8 ) & 0xFF ), cmd ];

		// concatenate our args (byte array)
		let frame_buffer = frame_header.concat( args );

		// compute checksum (first byte excluded)
		let cs = this.__spp_frame_checksum( frame_buffer );

		// create our suffix (including checksum)
		let frame_suffix = [ cs & 0xFF, ( cs >> 8 ) & 0xFF, 2 ];

		// return output buffer
		return ( frame_buffer.concat( frame_suffix ) );
	}

	async __send( cmd, args )
	{
		let spp_frame = this.__spp_frame_encode( cmd, args );
		if ( typeof( this.btsock ) !== 'undefined' )
			await write( new Buffer.from( spp_frame ) );
	}

	set_system_brightness( brightness )
	{
		this.__send( this.CMD_SET_SYSTEM_BRIGHTNESS, [ ( brightness & 0xFF ) ] );
	}

	set_box_mode( boxmode, visual = 0x00, more = [] )
	{
		if ( boxmode == this.BOX_MODE_OFF )
			return ( this.set_system_brightness( 0x00 ) );

		let data = [ ( boxmode & 0xFF ), ( visual & 0xFF ) ];
		for ( let part in more )
			data.push( part & 0xFF );

		this.__send( 0x45, data );
	}

	set_color( r, g, b )
	{
		this.__send( 0x6F, [ ( r & 0xFF ), ( g & 0xFF ), ( b & 0xFF ) ] );
	}

	encode_image( filepath, index = 0, subindex = 0 )
	{
		let data = null;
		if ( filepath != this.last.path || !this.last.data )
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

			this.last.path = filepath;
			this.last.data = data;
			this.last.raw = {};
		}
		else
			data = this.last.data;

		let tindex = ( index.toString() + '-' + subindex.toString() );
		if ( typeof( this.last.raw[ tindex ] ) === 'undefined' )
		{
			let speed = 100;
			if ( data.frames.length >= 2 )
				speed = ( data.frames[ 1 ].timeCode - data.frames[ 0 ].timeCode );

			this.last.raw[ tindex ] = this.encode_raw_image( {
				speed:		speed,
				width:		data.width,
				height:		data.height,
				length:		data.frames.length,
				data:		data.frames[ index ].data,
				timecode:	data.frames[ index ].timeCode
			} );
		}

		return ( this.last.raw[ tindex ] );
	}

	encode_raw_image( img )
	{
		// ensure image is square
		if ( img.width != img.height )
			return ( console.log( '\r[!] Image must be square.' ) );

		// resize if image is too big
		if ( img.width != this.size )
		{
			img = resize( img, this.size );
			if ( !img )
				throw new Error( 'Please choose an image with a multiple resolution of 16x16 !' );
		}

		// create palette and pixel array
		let pixels = [];
		let palette = [];
		for ( let y of [ ...Array( this.size ).keys() ] )
		{
			for ( let x of [ ...Array( this.size ).keys() ] )
			{
				let r, g, b;
				let pixel = img.data[ ( y * this.size ) + x ];
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

		console.log( '\r╔' + '═══'.repeat( this.size ).substr( 1 ) + '╗' );
		for ( let y of [ ...Array( img.height ).keys() ] )
		{
			let line = [];
			for ( let x of [ ...Array( img.width ).keys() ] )
				line.push( ( '0' + hexlify( pixels[ ( y * img.width ) + x ] ) ).slice( -2 ).replace( /0/g, ' ' ) );
			console.log( '\r║' + line.join( '.' ) + '║' );
		}
		console.log( '\r╚' + '═══'.repeat( this.size ).substr( 1 ) + '╝' );

		// encode pixels
		let bitwidth = Math.ceil( Math.log10( palette.length ) / Math.log10( 2 ) );
		let nbytes = Math.ceil( ( 256 * bitwidth ) / 8. );
		let encoded_pixels = new Array( nbytes ).fill().map( () => 0 );

		encoded_pixels = [];
		let encoded_byte = '';
		for ( let i of pixels )
		{
			encoded_byte = rjust( ( i >>> 0 ).toString( 2 ), bitwidth, '0' ) + encoded_byte;
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

		return ( [ palette.length, encoded_palette, encoded_data, img.length, img.timecode, img.speed ] );
	}

	draw_gif( filepath, sent, speed = 0, loop = true, index = 0 )
	{
		if ( Array.isArray( filepath ) )
			filepath = filepath[ 0 ];

		console.log( '\r[SEND]: GIF', filepath, speed );

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
			do
			{
				let nb_colors, palette, pixel_data, notimecode, nospeed;
				[ nb_colors, palette, pixel_data, len, notimecode, nospeed ] = this.encode_image( filepath, index );

				let frame_size = ( 7 + pixel_data.length + palette.length );
				let frame_header = [ 0xAA, ( frame_size & 0xFF ), ( ( frame_size >> 8 ) & 0xFF ), ( timecode & 0xFF ), ( ( timecode >> 8 ) & 0xFF ), 0, nb_colors ];
				let frame = frame_header.concat( palette ).concat( pixel_data );
				frames = frames.concat( frame );
				timecode += ( speed ? speed : notimecode );
			}
			while ( ++index < len );

			// send animation
			let nchunks = Math.ceil( len / 200. );
			for ( let i of [ ...Array( nchunks ).keys() ] )
			{
				let chunk = [ len & 0xFF, ( len >> 8 ) & 0xFF, i ];
				this.__send( 0x49, chunk.concat( frames.slice( ( i * 200 ), ( ( i + 1 ) * 200 ) ) ) );
				stop( false );
			}
		}
		catch ( error ) { stop( error ); }
	}

	draw_anim( filepaths, sent, speed = 0, loop = true, index = 0 )
	{
		console.log( '\r[SEND]: ANIM', filepaths, speed );

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
			do
			{
				let nb_colors, palette, pixel_data, nolen, notimecode, nospeed;
				[ nb_colors, palette, pixel_data, nolen, notimecode, nospeed ] = this.encode_image( filepaths[ index ], 0, index );

				let frame_size = ( 7 + pixel_data.length + palette.length );
				let frame_header = [ 0xAA, ( frame_size & 0xFF ), ( ( frame_size >> 8 ) & 0xFF ), ( timecode & 0xFF ), ( ( timecode >> 8 ) & 0xFF ), 0, nb_colors ];
				let frame = frame_header.concat( palette ).concat( pixel_data );
				frames = frames.concat( frame );
				timecode += ( speed ? speed : 100 );
			}
			while ( ++index < len );

			// send animation
			let nchunks = Math.ceil( len / 200. );
			for ( let i of [ ...Array( nchunks ).keys() ] )
			{
				let chunk = [ ( len & 0xFF ), ( ( len >> 8 ) & 0xFF ), i ];
				this.__send( 0x49, chunk.concat( frames.slice( ( i * 200 ), ( ( i + 1 ) * 200 ) ) ) );
				stop( false );
			}
		}
		catch ( error ) { stop( error ); }
	}

	draw_gif_delay( filepath, sent, speed = 0, loop = true, index = 0 )
	{
		if ( Array.isArray( filepath ) )
			filepath = filepath[ 0 ];

		index = 0;
		let length = 1;
		let timeout = 0;
		let stop = ( e, v ) => {
			clearTimeout( timeout );
			if ( e || !loop )
			{
				if ( sent )
					sent( e, v );

				sent = undefined;
			}
		};
		let next = () => {
			if ( index >= length )
			{
				stop( false );
				if ( loop )
					return ( this.draw_gif_delay( filepath, sent, speed, loop ) );
			}

			this.draw_pic( filepath, ( error, nolength, nospeed ) => {
				if ( error )
					return ( stop( error ) );

				length = nolength;
				if ( !speed )
					speed = nospeed;

				index += 1;
				timeout = setTimeout( next, speed );
			}, undefined, undefined, index );
		};

		try { next(); }
		catch ( error ) { stop( error ); }
	}

	draw_anim_delay( filepaths, sent, speed = 0, loop = true, index = 0 )
	{
		index = 0;
		let length = filepaths.length;
		let timeout = 0;
		let stop = ( e, v ) => {
			clearTimeout( timeout );
			if ( e || !loop )
			{
				if ( sent )
					sent( e, v );

				sent = undefined;
			}
		};
		let next = () => {
			if ( index >= length )
			{
				stop( false );
				if ( loop )
					return ( this.draw_anim_delay( filepaths, sent, ( speed || 100 ), loop ) );
			}

			this.draw_pic( filepaths[ index ], ( error, nolength, nospeed ) => {
				if ( error )
					return ( stop( error ) );

				//length = nolength;
				//if ( !speed )
				//	speed = nospeed;

				index += 1;
				timeout = setTimeout( next, speed );
			} );
		};

		try { next(); }
		catch ( error ) { stop( error ); }
	}

	draw_pic( filepath, sent, speed = 0, loop = true, index = 0, subindex = 0 )
	{
		if ( Array.isArray( filepath ) )
			filepath = filepath[ 0 ];

		console.log( '\r[SEND]: PIC', filepath, ( index ? index : '' ) );

		let stop = ( e, l, s ) => {
			if ( sent )
				sent( e, l, s );

			sent = undefined;
		};

		try
		{
			let [ nb_colors, palette, pixel_data, length, timecode, speed ] = this.encode_image( filepath, index, subindex );
			let prefix = [ 0x00, 0x0A, 0x0A, 0x04 ];
			let frame_size = ( 7 + pixel_data.length + palette.length );
			let frame_header = [ 0xAA, ( frame_size & 0xFF ), ( ( frame_size >> 8 ) & 0xFF ), 0, 0, 0, nb_colors ];

			// encode frames
			let frame = [].concat( frame_header );
			for ( let color of palette )
				frame = frame.concat( color );
			frame = frame.concat( pixel_data );

			// send animation
			this.__send( 0x44, prefix.concat( frame ) );

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

	//pixoo.size = ( 16 * scale );
	pixoo.connect().then( () => {
		/*
		// Define the hour format
		let iso = true;
		let degrees = true;
		let color = [ 0x00, 0x00, 0xFF ];

		let year = 2020;
		let month = 08;
		let day = 08;
		let hours = 08;
		let minutes = 42;
		let seconds = 00;

		//pixoo.set_box_mode( Pixoo.BOX_MODE_CLOCK, ( iso ? Pixoo.BOX_VISUAL_CLOCK_ISO : Pixoo.BOX_VISUAL_CLOCK_US ) );
		//pixoo.set_box_mode( Pixoo.BOX_MODE_TEMP, ( degrees ? Pixoo.BOX_VISUAL_TEMP_DEGREES : Pixoo.BOX_VISUAL_TEMP_FAHRENHEIT ) );
		//pixoo.set_box_mode( Pixoo.BOX_MODE_TEMP, 0x00, color );
		//pixoo.set_box_mode( 0x06, 0x00 ); // show stopwatch
		//pixoo.set_box_mode( 0x07, 0x00 ); // show scoreboard
		//pixoo.set_box_mode( Pixoo.BOX_MODE_COLOR, color[ 0 ], color.slice( 1 ) );
		//pixoo.__send( 0x18, [ ( year % 100 ), parseInt( year / 100 ) ].concat( [ month, day, hours, minutes, seconds ] ) ); // set datetime
		//pixoo.__send( 0x18, [ ( year % 100 ) * 100 + parseInt( year / 100 ) ].concat( [ month, day, hours, minutes, seconds ] ) ); // set datetime
		//pixoo.set_box_mode( Pixoo.BOX_MODE_OFF );
		pixoo.close();
		*/

		pixoo[ mode ]( files, error => { if ( error ) console.log( error ); pixoo.close(); }, speed, !noloop );
	} );
}
