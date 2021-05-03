const	{ Pixoo }	= require( './pixoo' );

// The first argument must be the MAC address of the display
const pixoo = new Pixoo( process.argv[ ( process.argv[ 0 ] == __filename ) ? 1 : 2 ] );
process.on( 'SIGINT', () => {
	pixoo.close();
	process.exit();
} );

pixoo.connect().then( () => {
	let color = [ 0x00, 0x00, 0xFF ]; // 0xRR, 0xGG, 0xBB
	//pixoo.set_box_mode( Pixoo.BOX_MODE_COLOR, ...color );

	let iso = true;
	let show = { time: 0x01, weather: 0x00, temperature: 0x00, calendar: 0x00 };
	let datetime = new Date();
	let clock_mode = 0x00;
	//pixoo.set_system_fullday( 0 );
	pixoo.set_system_datetime( datetime, ( iso ? Pixoo.BOX_VISUAL_CLOCK_ISO : Pixoo.BOX_VISUAL_CLOCK_US ) );
	//pixoo.set_box_mode( Pixoo.BOX_MODE_CLOCK, ( iso ? Pixoo.BOX_VISUAL_CLOCK_ISO : Pixoo.BOX_VISUAL_CLOCK_US ) );
	//pixoo.set_box_mode( Pixoo.BOX_MODE_CLOCK, 0x01, clock_mode, show.time, show.weather, show.temperature, show.calendar, ...color );

	let degrees = false; // or fahrenheit
	let brightness = 5; // percent
	//pixoo.set_system_climate( 42, 0 );
	//pixoo.set_box_mode( Pixoo.BOX_MODE_TEMP, 0x00, ...color );
	//pixoo.set_box_mode( Pixoo.BOX_MODE_TEMP, ...color, ( degrees ? Pixoo.BOX_VISUAL_TEMP_DEGREES : Pixoo.BOX_VISUAL_TEMP_FAHRENHEIT ), 0x00 );
	//pixoo.set_box_mode( Pixoo.BOX_MODE_TEMP, ...color, brightness, 0x00, 0x00, ...[ 0x00, 0x00, 0x00 ] );

	//pixoo.set_box_mode( Pixoo.BOX_MODE_EFFECTS, 1 );

	//pixoo.set_box_mode( Pixoo.BOX_MODE_EQUALIZER, 1 );
	//pixoo.set_box_mode( Pixoo.BOX_MODE_EQUALIZER, 0x01, 0x06 );

	let red_score = 1; // max 999
	let blue_score = 0; // max 999
	//pixoo.set_box_mode( Pixoo.BOX_MODE_SCOREBOARD, 0x00, ...this.__little_hex( red_score ), ...this.__little_hex( blue_score ) );

	pixoo.close();
} );
