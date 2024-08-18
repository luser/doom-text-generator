// TODO:
// get the extended characters from gzdoom
// more fonts?  some from popular megawads maybe?  hacx?  freedoom?
// someone asked for build + quake fonts
// .. also these https://forum.zdoom.org/viewtopic.php?f=37&t=33409&sid=d5022aefc120e44df307204f243589be
// someday, bbcode...
// better missing char handling
// refreshing loses the selected translation
// aspect ratio correction?
// metrics twiddles -- customize spacing, space width.  PADDING.
// custom translations!
// force into doom (heretic, hexen, ...) palette?
// drag and drop for wads
// pk3 support
// little info popup about a font (source, copyright, character set...)
// make translation more fast
// - preconvert default translation?
// allow using different fonts in one message (whoof)
// fix accents and other uses of too-high letters
// word wrap includes spaces oops
// why does "doom menu" have massive descender space whereas "doom menu small caps" does not
//
// TODO nice to do while i'm here:
// - modernize js
//   - load the json, as json
//   - i feel like i need a better way of handling the form elements, maybe i need a little lib of thin wrappers idk
//     - fragment should omit when value is default?
//     - kerning and line spacing should support both a slider and a spinner?  or is that too much
// - update the html
//   - too much text?  popups?  not sure
//   - no way to just enter a number
// - preview image edges?
//   - show width/height?
"use strict";
import {
    DOOM_FONTS, DOOM2_PALETTE,
    ZDOOM_TRANSLATIONS, ZDOOM_ACS_TRANSLATION_CODES, rgb
} from './data.js';

function mk(tag_selector, ...children) {
    let [tag, ...classes] = tag_selector.split('.');
    let el = document.createElement(tag);
    el.classList = classes.join(' ');
    if (children.length > 0) {
        if (!(children[0] instanceof Node) && typeof(children[0]) !== "string") {
            let [attrs] = children.splice(0, 1);
            for (let [key, value] of Object.entries(attrs)) {
                el.setAttribute(key, value);
            }
        }
        el.append(...children);
    }
    return el;
}

function trigger_local_download(filename, blob) {
    let url = URL.createObjectURL(blob);
    // To download a file, um, make an <a> and click it.  Not kidding
    let a = mk('a', {
        href: url,
        download: filename,
    });
    document.body.append(a);
    a.click();
    // Absolutely no idea when I'm allowed to revoke this, but surely a minute is safe
    window.setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
    }, 60 * 1000);
}

function random_choice(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function translation_to_gradient(spans) {
    let parts = ["linear-gradient(to right"];
    for (let span of spans) {
        // color + position
        parts.push(`, ${span[2].hex} ${span[0] / 255 * 100}%`);
        parts.push(`, ${span[3].hex} ${span[1] / 255 * 100}%`);
    }
    parts.push(")");
    return parts.join('');
}

function string_from_buffer_ascii(buf, start = 0, len) {
    if (ArrayBuffer.isView(buf)) {
        start += buf.byteOffset;
        buf = buf.buffer;
    }
    return String.fromCharCode.apply(null, new Uint8Array(buf, start, len));
}

async function parse_wad(wadfile) {
    // Use the Blob API to avoid loading the whole file at once, since it might be real big
    // and we only care about a tiny bit of it
    let header_buf = await wadfile.slice(0, 12).arrayBuffer();
    let data = new DataView(header_buf);
    let magic = string_from_buffer_ascii(data, 0, 4);
    if (magic !== 'PWAD' && magic !== 'IWAD') {
        if (magic.startsWith('PK')) {
            throw new Error("This doesn't appear to be a WAD file.  (PK3 isn't supported, sorry!)");
        }
        else {
            throw new Error("This doesn't appear to be a WAD file.");
        }
    }

    let lumpct = data.getUint32(4, true);
    let diroffset = data.getUint32(8, true);

    let dir_buf = await wadfile.slice(diroffset, diroffset + 16 * lumpct).arrayBuffer();
    data = new DataView(dir_buf);
    let p = 0;
    let lumps = [];
    for (let i = 0; i < lumpct; i++) {
        let offset = data.getUint32(p, true);
        let size = data.getUint32(p + 4, true);
        let rawname = string_from_buffer_ascii(data, p + 8, 8);
        let nulpos = rawname.indexOf('\x00')
        let name = nulpos < 0 ? rawname : rawname.substring(0, nulpos);
        lumps.push({name: name.toUpperCase(), size, offset});

        p += 16;
    }

    return lumps;
}

function parse_doom_graphic(buf, palette) {
    let data = new DataView(buf);
    let width = data.getUint16(0, true);
    let height = data.getUint16(2, true);
    let xoffset = data.getInt16(4, true);
    let yoffset = data.getInt16(6, true);

    let canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    let ctx = canvas.getContext('2d');
    let imgdata = ctx.getImageData(0, 0, width, height);
    let px = imgdata.data;

    for (let x = 0; x < width; x++) {
        let p = data.getInt32(8 + 4 * x, true);
        while (true) {
            let y0 = data.getUint8(p);
            if (y0 === 0xff)
                // FF marks last post
                break;
            let pixelct = data.getUint8(p + 1);
            p += 3;  // skip header and a padding byte
            for (let dy = 0; dy < pixelct; dy++) {
                let index = data.getUint8(p);
                let color = palette[index];
                let q = ((y0 + dy) * width + x) * 4;
                px[q + 0] = color[0];
                px[q + 1] = color[1];
                px[q + 2] = color[2];
                px[q + 3] = 255;
                p += 1;
            }
            p += 1;  // skip another padding byte
        }
    }

    ctx.putImageData(imgdata, 0, 0);
    return canvas;
};

// XXX absolutely no idea what this was for
const USE_ZDOOM_TRANSLATION_ROUNDING = true;


const SAMPLE_MESSAGES = [{
    // Doom 1
    font: 'doom-small',
    messages: [
        "please don't leave, there's more\ndemons to toast!",
        "let's beat it -- this is turning\ninto a bloodbath!",
        "i wouldn't leave if i were you.\ndos is much worse.",
        "you're trying to say you like dos\nbetter than me, right?",
        "don't leave yet -- there's a\ndemon around that corner!",
        "ya know, next time you come in here\ni'm gonna toast ya.",
        "go ahead and leave. see if i care.",
    ],
}, {
    // Doom II
    font: 'doom-small',
    messages: [
        "you want to quit?\nthen, thou hast lost an eighth!",
        "don't go now, there's a \ndimensional shambler waiting\nat the dos prompt!",
        "get outta here and go back\nto your boring programs.",
        "if i were your boss, i'd \n deathmatch ya in a minute!",
        "look, bud. you leave now\nand you forfeit your body count!",
        "just leave. when you come\nback, i'll be waiting with a bat.",
        "you're lucky i don't smack\nyou for thinking about leaving.",
    ],
}, {
    // Strife
    font: 'strife-small2',
    messages: [
        "where are you going?!\nwhat about the rebellion?",
        "carnage interruptus...\nwhat a tease!",
        "but you're the hope\n-- my only chance!!",
        "nobody walks out on blackbird.",
        "i thought you were different...",
        "fine! just kill and run!",
        "you can quit...\nbut you can't hide...",
        "whaaa, what's the matter?\nmommy says dinnertime?",
    ],
}, {
    // Chex Quest
    font: 'chex-small',
    messages: [
        "Don't quit now, there are still\nflemoids on the loose!",
        "Don't give up -- the flemoids will\nget the upper hand!",
        "Don't leave now.\nWe need your help!",
        "I hope you're just taking a\nbreak for Chex(R) party mix.",
        "Don't quit now!\nWe need your help!",
        "Don't abandon the\nIntergalactic Federation of Cereals!",
        "The real Chex(R) Warrior\nwouldn't give up so fast!",
    ],
}, {
    // Pangrams
    font: null,  // random
    messages: [
        "The quick brown fox jumps over the lazy dog.",
        "Jived fox nymph grabs quick waltz.",
        "Glib jocks quiz nymph to vex dwarf.",
        "Sphinx of black quartz, judge my vow.",
        "How vexingly quick daft zebras jump!",
        "The five boxing wizards jump quickly.",
        "Pack my box with five dozen liquor jugs.",
        "Jackdaws love my big sphynx of quartz.",
        "Cwm fjord bank glyphs vext quiz.",
    ],
}];

// This size should be big enough to fit any character!
// FIXME could just auto resize when it's too small
const TRANS_WIDTH = 32;
const TRANS_HEIGHT = 32;
let trans_canvas = mk('canvas', {width: TRANS_WIDTH, height: TRANS_HEIGHT});

// "Standard" fonts I scraped myself from various places and crammed into montages
class BuiltinFont {
    constructor(fontdef) {
        this.glyphs = {};
        // Decode metrics from WxH+X+Y into, like, numbers
        for (let [ch, metrics] of Object.entries(fontdef.glyphs)) {
            let [_, width, height, x, y, dx, dy] = metrics.match(/^(\d+)x(\d+)[+](\d+)[+](\d+)(?:@(-?\d+),(-?\d+))?$/);
            this.glyphs[ch] = {
                // Standard props
                width: parseInt(width, 10),
                height: parseInt(height, 10),
                // Montage props
                x: parseInt(x, 10),
                y: parseInt(y, 10),
                dx: parseInt(dx ?? '0', 10),
                dy: parseInt(dy ?? '0', 10),
            };
        }

        this.space_width = fontdef.space_width;
        this.line_height = fontdef.line_height;
        this.kerning = fontdef.kerning;
        this.lightness_range = fontdef.lightness_range;

        this.name = fontdef.meta.name;
        this.creator = fontdef.meta.creator;
        this.license = fontdef.meta.license;
        this.source = fontdef.meta.source;

        this.montage = new Image;
        this.montage.src = fontdef.image;
        this.loading_promise = this.montage.decode();
    }

    draw_glyph(glyph, ctx, x, y) {
        // TODO wait, shouldn't 'y' be the baseline, not the top of the glyph
        ctx.drawImage(
            this.montage,
            glyph.x, glyph.y, glyph.width, glyph.height,
            x, y, glyph.width, glyph.height);
    }
}


// Font loaded from a user-supplied WAD
class WADFont {
    constructor(glyphs) {
        this.glyphs = glyphs;

        // Hurriedly invent some metrics
        this.line_height = 0;
        this.space_width = 0;
        let uniform_width = true;
        for (let glyph of Object.values(glyphs)) {
            this.line_height = Math.max(this.line_height, glyph.height);
            if (this.space_width === 0) {
                this.space_width = glyph.width;
            }
            else if (this.space_width !== glyph.width) {
                uniform_width = false;
            }
        }
        if (! uniform_width) {
            // This is what ZDoom does, don't look at me
            if ("N" in glyphs) {
                this.space_width = Math.floor(glyphs["N"].width / 2 + 0.5);
            }
            else {
                this.space_width = 4;
            }
        }

        // Font kerning mostly exists for the big Doom menu fonts; for custom fonts you can use
        // the global slider for now (since mixing fonts doesn't work yet)
        this.kerning = 0;
        this.lightness_range = [0, 255];  // TODO can just get from the palette?  or do i need the actual lightness of the colors that get used?  urgh

        this.name = "";  // XXX ???
        this.creator = "";  // XXX ???
        this.license = "";  // XXX ???
        this.source = "";  // XXX ???
    }

    draw_glyph(glyph, ctx, x, y) {
        ctx.drawImage(glyph.canvas, x, y);
    }
}


class BossBrain {
    constructor() {
        // Visible canvas on the actual page
        this.final_canvas = document.querySelector('canvas');
        // Canvas we do most of our drawing to, at 1x
        this.buffer_canvas = mk('canvas');

        this.form = document.querySelector('form');
        this.fonts = {};

        this.init_form();
    }

    async init() {
        let load_promises = [];
        for (let [fontname, fontdef] of Object.entries(DOOM_FONTS)) {
            let font = new BuiltinFont(fontdef);
            if (font.loading_promise) {
                load_promises.push(font.loading_promise);
            }
            this.fonts[fontname] = font;
        }

        await Promise.all(load_promises);

        this.font_list_el = document.querySelector('#js-font-list');
        for (let [ident, fontdef] of Object.entries(DOOM_FONTS)) {
            // TODO pop open a lil info overlay for each of these
            let name_canvas = this.render_text({
                text: fontdef.meta.name.replace(/—/, "-").replace(/ font\b/, ""),
                default_font: ident,
                scale: 2,
                canvas: null,
            });
            let li = mk('li',
                mk('label',
                    mk('input', {type: 'radio', name: 'font', value: ident}),
                    " ",
                    name_canvas,
                ),
            );
            this.font_list_el.append(li);
        }

        if (! this.form.elements['font'].value) {
            this.form.elements['font'].value = 'doom-small';
        }

        this.translations = Object.assign({}, ZDOOM_TRANSLATIONS);
        // Add slots for custom ones
        this.custom_translations = ['custom1'];
        this.translations['custom1'] = {
            normal: [[0, 255, rgb`#000000`, rgb`#FFFFFF`]],
            console: [[0, 255, rgb`#000000`, rgb`#FFFFFF`]],
            flat: rgb`#FFFFFF`,
            is_custom: true,
        };
    }

    async init_form() {
        // While this is checked, the form itself is gone, for the convenience of, for example,
        // people using this live in OBS.  Check this first, before waiting on images to load, to
        // minimize the intermediate flash.
        this.form.elements['solo'].addEventListener('change', ev => {
            document.body.classList.toggle('solo', ev.target.checked);
            // Need to do this directly since usually we rely on it happening due to a redraw
            this.update_fragment();
        });
        // But you can turn it off by clicking anywhere
        document.querySelector('#canvas-wrapper').addEventListener('click', () => {
            this.form.elements['solo'].checked = false;
            document.body.classList.remove('solo');
            this.update_fragment();
        });

        await this.init();

        this.form.addEventListener('submit', ev => {
            ev.preventDefault();
        });

        let textarea = this.form.elements['text'];
        let redraw_handler = this.redraw_current_text.bind(this);
        textarea.addEventListener('input', redraw_handler);

        // Font
        let font_ctl = this.form.elements['font'];
        document.querySelector('#js-font-list').addEventListener('change', ev => {
            this.form.classList.toggle('using-console-font', font_ctl.value === 'zdoom-console');
            this.redraw_current_text();
        });
        this.form.classList.toggle('using-console-font', font_ctl.value === 'zdoom-console');

        let wad_ctl = this.form.elements['wad'];
        wad_ctl.addEventListener('change', ev => {
            for (let file of ev.target.files) {
                this.load_fonts_from_wad(file);
            }
        });
        // TODO support drag and drop, uggh
        document.querySelector('#button-upload').addEventListener('click', ev => {
            wad_ctl.click();
        });

        // Scale
        let scale_ctl = this.form.elements['scale'];
        function update_scale_label() {
            scale_ctl.parentNode.querySelector('output').textContent = `${scale_ctl.value}×`;
        }
        scale_ctl.addEventListener('input', ev => {
            update_scale_label();
            this.redraw_current_text();
        });
        update_scale_label();

        // Kerning
        let kerning_ctl = this.form.elements['kerning'];
        function update_kerning_label() {
            kerning_ctl.parentNode.querySelector('output').textContent = String(kerning_ctl.value);
        }
        kerning_ctl.addEventListener('input', ev => {
            update_kerning_label();
            this.redraw_current_text();
        });
        update_kerning_label();

        // Line spacing
        let line_spacing_ctl = this.form.elements['line-spacing'];
        function update_line_spacing_label() {
            line_spacing_ctl.parentNode.querySelector('output').textContent = String(line_spacing_ctl.value);
        }
        line_spacing_ctl.addEventListener('input', ev => {
            update_line_spacing_label();
            this.redraw_current_text();
        });
        update_line_spacing_label();

        // Alignment
        let alignment_list = this.form.querySelector('ul.alignment');
        alignment_list.addEventListener('change', redraw_handler);

        // Syntax
        let syntax_list = this.form.querySelector('ul.syntax');
        syntax_list.addEventListener('change', redraw_handler);

        // Background
        // FIXME i suspect if you edit the fragment live, the bgcolor control will not update, sigh
        let bg_ctl = this.form.elements['bg'];
        let bgcolor_ctl = this.form.elements['bgcolor'];
        bg_ctl.addEventListener('click', ev => {
            this._fix_bg_controls();
            this.update_background();
            this.redraw_current_text();
        });
        bgcolor_ctl.addEventListener('input', ev => {
            this.set_background(bgcolor_ctl.value);
        });
        this.update_background();

        // Wrapping
        this.form.elements['wrap'].addEventListener('change', () => {
            this._fix_wrap_controls();
            this.redraw_current_text();
        });
        for (let name of ['wrap-width', 'wrap-units'/*, 'overflow'*/]) {
            this.form.elements[name].addEventListener('input', () => {
                if (this.form.elements['wrap'].checked) {
                    this.redraw_current_text();
                }
            });
        }

        // Translations
        let trans_list = this.form.querySelector('.translations');
        this.translation_elements = {};
        for (let [name, trans] of Object.entries(this.translations)) {
            let normal_example = mk('div.translation-example.-normal');
            normal_example.style.backgroundImage = translation_to_gradient(trans.normal);
            let console_example = mk('div.translation-example.-console');
            console_example.style.backgroundImage = translation_to_gradient(trans.console ?? trans.normal);

            let el = mk('label',
                mk('input', {name: 'translation', type: 'radio', value: name}),
                normal_example,
                console_example,
                mk('span.name', name),
                mk('span.acs-escape', trans.acs_code ? '\\c' + trans.acs_code : ''),
                trans.flat ? mk('button', {type: 'button', style: `background: ${trans.flat.hex}`, 'data-hex': trans.flat.hex}) : '',
            );
            this.translation_elements[name] = el;
            trans_list.append(mk('li', el));
        }
        trans_list.addEventListener('change', redraw_handler);
        // Catch button clicks
        trans_list.addEventListener('click', ev => {
            if (ev.target.tagName !== 'BUTTON')
                return;

            this.set_background(ev.target.getAttribute('data-hex'));
        });

        // Custom translations
        for (let name of this.custom_translations) {
            // TODO save/load from fragment in some sensible way, oy
            // TODO initialize also?  either the form to the translation or vice versa
            let start = this.form.elements[name + 'a'];
            let middle = this.form.elements[name + 'b'];
            let end = this.form.elements[name + 'c'];
            let use_middle = this.form.elements[name + 'mid'];

            Object.assign(this.translations[name], {
                start_ctl: start,
                middle_ctl: middle,
                end_ctl: end,
                use_middle_ctl: use_middle,
            });

            let handler = ev => {
                this.update_custom_translation(name);
            };
            for (let el of [start, middle, end, use_middle]) {
                el.addEventListener('change', handler);
            }
        }

        // Miscellaneous
        let handle_radioset = ev => this._update_radioset(ev.target.closest('ul.radioset'));
        for (let ul of document.querySelectorAll('ul.radioset')) {
            ul.addEventListener('change', handle_radioset);
        }

        // This also fixes the form and does the initial draw.
        this.set_form_from_fragment();
        // If the textarea is still blank (which may not be the case if browser navigation restored
        // previously-typed text!), populate it and re-draw.
        if (textarea.value === "") {
            this.randomize();
        }

        // Utility buttons
        document.querySelector('#button-randomize').addEventListener('click', () => {
            this.randomize();
        });
        document.querySelector('#button-copy').addEventListener('click', ev => {
            if (! window.ClipboardItem) {
                alert("hello sorry, in firefox this is still behind a preference, you will need to visit about:config and enable:\n\ndom.events.asyncClipboard.clipboardItem\n\nthen refresh and try again");
                return;
            }

            this.final_canvas.toBlob(async blob => {
                if (! blob)
                    return;

                await navigator.clipboard.write([ new ClipboardItem({'image/png': blob}) ]);
                let star = mk('div.star', "⭐");
                star.style.left = `${ev.clientX}px`;
                star.style.top = `${ev.clientY}px`;
                document.body.append(star);
                setTimeout(() => star.remove(), 1000);
            });
        });
        document.querySelector('#button-download').addEventListener('click', () => {
            this.final_canvas.toBlob(blob => {
                if (! blob)
                    return;

                let slug = (
                    this.form.elements['text'].value
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^-0-9a-z]+/g, '')
                );
                let stem = this.form.elements['font'].value + '-' + (slug || 'blank');
                trigger_local_download(stem.substring(0, 100) + '.png', blob);
            });
        });

        // Update if the fragment changes
        window.addEventListener('popstate', ev => {
            this.set_form_from_fragment();
        });
    }

    _update_radioset(ul) {
        for (let li of ul.querySelectorAll('li.selected')) {
            li.classList.remove('selected');
        }
        for (let radio of ul.querySelectorAll('input[type=radio]:checked')) {
            radio.closest('ul.radioset > li').classList.add('selected');
        }
    }
    _update_all_radiosets() {
        for (let ul of document.querySelectorAll('ul.radioset')) {
            this._update_radioset(ul);
        }
    }

    set_form_from_fragment() {
        let args = new URLSearchParams(location.hash.substring(1));
        for (let [key, value] of args) {
            let el = this.form.elements[key];
            if (! el)
                continue;

            if (el.type === 'checkbox' && el.value === value) {
                el.checked = true;
            }
            else if (el.type === 'file') {
                el.value = '';
            }
            else {
                el.value = value;
            }
        }

        this.fix_form();
        this.redraw_current_text();
    }

    _fix_bg_controls() {
        this.form.elements['bgcolor'].disabled = ! this.form.elements['bg'].checked;
    }

    _fix_wrap_controls() {
        let disabled = ! this.form.elements['wrap'].checked;
        this.form.elements['wrap-width'].disabled = disabled;
        this.form.elements['wrap-units'].disabled = disabled;
        //this.form.elements['overflow'].disabled = disabled;
    }

    // Update the form with various internal consistency stuff
    fix_form() {
        this._update_all_radiosets();
        this._fix_bg_controls();
        this._fix_wrap_controls();

        // XXX i feel like i'm repeating myself a bit.  what if they had a trigger instead
        let scale_ctl = this.form.elements['scale'];
        scale_ctl.parentNode.querySelector('output').textContent = `${scale_ctl.value}×`;
        let kerning_ctl = this.form.elements['kerning'];
        kerning_ctl.parentNode.querySelector('output').textContent = String(kerning_ctl.value);
        let line_spacing_ctl = this.form.elements['line-spacing'];
        line_spacing_ctl.parentNode.querySelector('output').textContent = String(line_spacing_ctl.value);

        document.body.classList.toggle('solo', this.form.elements['solo'].checked);

        for (let name of this.custom_translations) {
            this.update_custom_translation(name);
        }
    }

    update_fragment() {
        // FIXME do something with file uploads
        let data = new FormData(this.form);
        data.delete('wad');  // file upload control does not have a useful value
        let font = this.fonts[data.get('font')];
        if (! (font instanceof BuiltinFont)) {
            // The URL can't handle custom fonts, so fall back to the default
            data.set('font', 'doom-small');
        }
        history.replaceState(null, document.title, '#' + new URLSearchParams(data));
    }

    async load_fonts_from_wad(wadfile) {
        let output_el = document.querySelector('#wad-uploader output');
        output_el.classList.remove('--success', '--failure');
        output_el.textContent = 'Beep boop, computing...';
        output_el.offsetWidth;

        let lumps;
        try {
            lumps = await parse_wad(wadfile);
        }
        catch (e) {
            output_el.classList.add('--failure');
            output_el.textContent = String(e);
            return;
        }
        // Look for fonts by looking for lumps of the form NAMExxx, where xxx is a range of
        // numbers spanning at least 65 to 90 (A-Z) or 97 to 122 (a-z)
        let lump_index = {};
        let possible_font_prefixes = [];
        for (let lump of lumps) {
            lump_index[lump.name] = lump;
            if (lump.name.endsWith('65')) {
                let numlen = 2;
                if (lump.name.endsWith('0065')) {
                    numlen = 4;
                }
                else if (lump.name.endsWith('065')) {
                    numlen = 3;
                }
                possible_font_prefixes.push([lump.name, numlen]);
            }
            else if (lump.name.endsWith('097')) {
                let numlen = 3;
                if (lump.name.endsWith('0097')) {
                    numlen = 4;
                }
                possible_font_prefixes.push([lump.name, numlen]);
            }
        }

        if (possible_font_prefixes.length === 0) {
            output_el.classList.add('--failure');
            output_el.textContent = "Sorry! Couldn't find anything in this WAD that looks like a font.";
            return;
        }

        // Extract the palette first, if any
        let palette;
        if ('PLAYPAL' in lump_index) {
            let lump = lump_index['PLAYPAL'];
            if (lump.size >= 768) {
                palette = [];
                let buf = await wadfile.slice(lump.offset, lump.offset + 768).arrayBuffer();
                let bytes = new Uint8Array(buf);
                for (let i = 0; i < 256; i++) {
                    palette.push([bytes[i*3], bytes[i*3 + 1], bytes[i*3 + 2]]);
                }
            }
        }
        if (! palette) {
            // Default to Doom 2 for now I guess
            // TODO UI for choosing a different stock palette...?
			palette = DOOM2_PALETTE;
        }

        let found_fonts = 0;
        for (let [name, suffixlen] of possible_font_prefixes) {
            let prefix = name.substring(0, name.length - suffixlen);
            let n0 = parseInt(name.substring(name.length - suffixlen), 10);

            let possible_glyphs = new Map;
            for (let lump of lumps) {
                if (lump.name.startsWith(prefix)) {
                    let num = parseInt(lump.name.substring(prefix.length), 10);
                    if (num !== num)
                        continue;
                    possible_glyphs.set(num, lump);
                }
            }

            let found_all = true;
            for (let n = n0 + 1; n < n0 + 26; n++) {
                if (! possible_glyphs.has(n)) {
                    found_all = false;
                    break;
                }
            }
            if (! found_all) {
                console.log("not a font (no full alphabet):", prefix);
                continue;
            }

            // We might still be fooled by e.g. a bunch of patches, so if there are too many
            // "glyphs" in the [0, 31] range, it's probably not a font
            let found_control = 0;
            for (let n = 0; n < 32; n++) {
                if (possible_glyphs.has(n)) {
                    found_control += 1;
                }
            }
            if (found_control > 8) {
                console.log("not a font (too many control chars):", prefix);
                continue;
            }

            // OK, finally, we think we have a font; convert the map into a table of
            // glyphs and decode the image data
            console.log("looks like we have a font:", prefix);
            let glyphs = {};
            for (let [n, lump] of possible_glyphs) {
                let buf = await wadfile.slice(lump.offset, lump.offset + lump.size).arrayBuffer();
                let canvas = parse_doom_graphic(buf, palette);
                glyphs[String.fromCharCode(n)] = {
                    width: canvas.width,
                    height: canvas.height,
                    canvas: canvas,
                };
            }

            let ident = wadfile.name + ":" + prefix;
            this.fonts[ident] = new WADFont(glyphs);

            let name_canvas = this.render_text({
                text: "Hello, world!",
                default_font: ident,
                scale: 2,
                canvas: null,
            });
            let li = mk('li',
                mk('label',
                    mk('input', {type: 'radio', name: 'font', value: ident}),
                    " ",
                    `${wadfile.name} — ${prefix}`,
                    mk('br'),
                    name_canvas,
                ),
            );
            this.font_list_el.append(li);
            found_fonts += 1;

            // If this is the first font we found, go ahead and select it and redraw.
            // This also speeds up getting back where you were after refreshing
            if (found_fonts === 1) {
                this.form.elements['font'].value = ident;
                // Fire a 'change' event so state gets tidied up
                // FIXME uh this doesn't seem to update the .selected though
                let ev = new Event('change');
                for (let radio of this.form.elements['font']) {
                    if (radio.checked) {
                        radio.dispatchEvent(ev);
                        break;
                    }
                }
                this.redraw_current_text();
            }
        }

        if (found_fonts === 0) {
            output_el.classList.add('--failure');
            output_el.textContent = "Sorry! Couldn't find anything in this WAD that looks like a font.";
            return;
        }

        output_el.classList.add('--success');
        output_el.textContent = `Found ${found_fonts === 1 ? "a font" : String(found_fonts) + " fonts"}, you're all set!`;
    }

    // Roll a random message and color
    randomize() {
        let group = random_choice(SAMPLE_MESSAGES);
        this.form.elements['text'].value = random_choice(group.messages);

        this.form.elements['font'].value = group.font ?? random_choice(Object.keys(DOOM_FONTS));

        if (Math.random() < 0.2) {
            this.form.elements['translation'].value = '';
        }
        else {
            this.form.elements['translation'].value = random_choice(Object.keys(this.translations));
        }

        this._update_all_radiosets();
        this.redraw_current_text();
    }

    set_background(bgcolor) {
        if (bgcolor === null) {
            this.form.elements['bg'].checked = false;
            this.form.elements['bgcolor'].disabled = true;
        }
        else {
            this.form.elements['bg'].checked = true;
            this.form.elements['bgcolor'].disabled = false;
            this.form.elements['bgcolor'].value = bgcolor;
        }
        this.update_background();
        this.redraw_current_text();
    }

    update_background() {
        let canvas_wrapper = document.getElementById('canvas-wrapper');
        if (this.form.elements['bg'].checked) {
            canvas_wrapper.style.backgroundColor = this.form.elements['bgcolor'].value;
        }
        else {
            canvas_wrapper.style.backgroundColor = 'transparent';
        }
    }

    update_custom_translation(name) {
        let trans = this.translations[name];
        if (trans.use_middle_ctl.checked) {
            trans.normal = [
                [0, 127, rgb([trans.start_ctl.value]), rgb([trans.middle_ctl.value])],
                [128, 255, rgb([trans.middle_ctl.value]), rgb([trans.end_ctl.value])],
            ];
        }
        else {
            trans.normal = [[0, 255, rgb([trans.start_ctl.value]), rgb([trans.end_ctl.value])]];
        }
        trans.console = trans.normal;

        trans.middle_ctl.disabled = ! trans.use_middle_ctl.checked;

        // FIXME when there's several
        let output = document.querySelector('.shabby-gradient-editor output');
        let gradient = translation_to_gradient(trans.normal);
        output.style.backgroundImage = gradient;
        for (let ex of this.translation_elements[name].querySelectorAll('div.translation-example')) {
            ex.style.backgroundImage = gradient;
        }

        // TODO only need to do this if it actually uses this translation...
        this.redraw_current_text();
    }

    redraw_current_text() {
        let elements = this.form.elements;
        let font = this.fonts[elements['font'].value];

        let wrap = null;
        if (elements['wrap'].checked) {
            let n = Math.max(0, parseFloat(elements['wrap-width'].value));
            let unit = elements['wrap-units'].value;
            let scale = 1;
            if (unit === 'em') {
                if (font.glyphs['m']) {
                    scale = font.glyphs['m'].width;
                }
                else if (font.glyphs['M']) {
                    scale = font.glyphs['M'].width;
                }
                else {
                    // ???
                    scale = font.line_height;
                }
            }
            else if (unit === 'sp') {
                if (font.glyphs[' ']) {
                    scale = font.glyphs[' '].width;
                }
                else {
                    scale = font.space_width;
                }
            }

            wrap = n * scale;
        }

        this.render_text({
            text: elements['text'].value,
            syntax: elements['syntax'].value,
            scale: elements['scale'].value,
            kerning: parseInt(elements['kerning'].value, 10),
            line_spacing: parseInt(elements['line-spacing'].value, 10),
            wrap: wrap,
            default_font: elements['font'].value,
            default_translation: elements['translation'].value || null,
            alignment: elements['align'].value,
            background: elements['bg'].checked ? elements['bgcolor'].value : null,
        });

        this.update_fragment();
    }

    render_text(args) {
        let text = args.text;
        let syntax = args.syntax;
        if (syntax !== 'acs') {
            syntax = 'none';
        }
        let scale = args.scale || 1;
        let kerning = args.kerning || 0;
        let line_spacing = args.line_spacing || 0;
        let default_font = args.default_font || 'doom-small';
        let default_translation = args.default_translation || null;
        let alignment = args.alignment;
        if (alignment === null || alignment === undefined) {
            alignment = 0.5;
        }
        let background = args.background;
        let wrap = args.wrap || null;

        let final_canvas;
        if (args.canvas === null) {
            // This means use a new canvas
            final_canvas = document.createElement('canvas');
            final_canvas.width = 32;
            final_canvas.height = 32;
        }
        else if (args.canvas) {
            final_canvas = args.canvas;
        }
        else {
            // Undefined means use the default canvas
            final_canvas = this.final_canvas;
        }

        if (syntax === 'acs') {
            text = text.replace(/\\\n/g, "").replace(/\\n/g, "\n");
        }

        let lines = text.split('\n');

        let font = this.fonts[default_font];
        // XXX handle error?

        // Compute some layout metrics first
        let draws = [];
        let line_stats = [];
        let y = 0;
        let lineno = 0;
        for (let line of lines) {
            // Note: with ACS, the color reverts at the end of every line
            let translation = default_translation;
            let x = 0;
            let last_space_index = null;
            // TODO line height may need adjustment if there's a character that extends above the top of the line
            // TODO options for this?

            let character_regex;
            if (syntax === 'acs') {
                character_regex = /\\c\[(.*?)\]|\\c(.)|\\([0-7]{3})|\\x([0-9a-fA-F]{2})|\\([\\"])|./g;
            }
            else {
                character_regex = /./g;
            }
            let match;
            while (match = character_regex.exec(line)) {
                let ch = match[0];
                if (match[1] !== undefined) {
                    // ACS translation by name
                    // TODO this fudges the aliasing a bit
                    translation = match[1].toLowerCase().replace(/ /g, '').replace(/grey/g, 'gray');
                    if (translation === 'untranslated') {
                        translation = null;
                    }
                    else if (this.translations[translation] === undefined) {
                        // TODO warn?
                        translation = null;
                    }
                    continue;
                }
                else if (match[2] !== undefined) {
                    // ACS translation code
                    translation = ZDOOM_ACS_TRANSLATION_CODES[match[2]];
                    continue;
                }
                else if (match[3] !== undefined) {
                    // Octal escape
                    ch = String.fromCharCode(parseInt(match[3], 8));
                }
                else if (match[4] !== undefined) {
                    // Hex escape
                    ch = String.fromCharCode(parseInt(match[4], 16));
                }
                else if (match[5] !== undefined) {
                    // Literal escape (\\ or \")
                    ch = match[5];
                }

                let is_space = (ch === ' ' || ch === '\t');
                if (is_space) {
                    last_space_index = draws.length;
                }

                if (x > 0) {
                    x += (font.kerning || 0);
                    x += kerning;
                }

                let glyph = font.glyphs[ch];
                // TODO better handle lowercase remapping, turn anything else into...  something?
                if (! glyph) {
                    if (ch === ' ') {
                        // With no explicit space glyph, fall back to the font prop
                        // TODO this isn't always populated oops
                        x += (font.space_width || 0);
                        continue;
                    }

                    // Try changing the case
                    if (ch !== ch.toUpperCase()) {
                        glyph = font.glyphs[ch.toUpperCase()];
                    }
                    else if (ch !== ch.toLowerCase()) {
                        glyph = font.glyphs[ch.toLowerCase()];
                    }

                    // FIXME if still no good, do some fallback

                    if (! glyph)
                        continue;
                }

                draws.push({
                    _ch: ch,
                    glyph: glyph,
                    lineno: lineno,
                    x: x,
                    translation: translation,
                    is_space: is_space,
                });

                x += glyph.width;

                if (! is_space && wrap !== null && x > wrap && last_space_index !== null) {
                    // We overshot the wrap limit!  Backtrack one word and fix this by breaking the
                    // line.  (Note that if we never saw a space, this is just a long word and
                    // there's nothing we can do about it.)
                    let space = draws[last_space_index];

                    // End the current line
                    line_stats.push({
                        width: space.x,
                        x0: 0,  // updated below
                        y0: y,
                    });
                    y += font.line_height + line_spacing;
                    lineno += 1;

                    // Update all the rest of the characters in the line.  Note that if there's no
                    // space glyph, the "space" we saw is really just the next non-space character.
                    let i0 = last_space_index;
                    if (space.is_space) {
                        i0 += 1;
                    }
                    let dx = draws[i0].x;
                    for (let i = i0; i < draws.length; i++) {
                        draws[i].lineno += 1;
                        draws[i].x -= dx;
                    }

                    // Update our current x position, discarding any kerning, and continue
                    x -= dx;
                    last_space_index = null;
                }
            }

            line_stats.push({
                width: x,
                x0: 0,  // updated below
                y0: y,
            });

            y += font.line_height + line_spacing;
            lineno += 1;
        }

        // Undo this, since there's no spacing after the last line
        if (lines.length > 0) {
            y -= line_spacing;
        }

        // Resize the canvas to fit snugly
        let canvas_width = Math.max(...Object.values(line_stats).map(line_stat => line_stat.width));
        let canvas_height = y - line_spacing;
        this.buffer_canvas.width = canvas_width;
        this.buffer_canvas.height = canvas_height;
        final_canvas.width = canvas_width * scale;
        final_canvas.height = canvas_height * scale;
        if (canvas_width === 0 || canvas_height === 0) {
            return;
        }

        // Align text horizontally
        if (alignment > 0) {
            for (let line_stat of line_stats) {
                line_stat.x0 = Math.floor((canvas_width - line_stat.width) * alignment);
            }
        }

        // And draw!
        let ctx = this.buffer_canvas.getContext('2d');
        // FIXME consolidate into one object
        for (let draw of draws) {
            let line_stat = line_stats[draw.lineno];
            let glyph = draw.glyph;
            let px = line_stat.x0 + (glyph.dx || 0) + draw.x;
            let py = line_stat.y0 + (glyph.dy || 0);
            if (draw.translation) {
                // Argh, we need to translate
                let transdef = this.translations[draw.translation];
                let trans = default_font === 'zdoom-console' ? transdef.console : transdef.normal;
                // First draw the character to the dummy canvas -- note we can't
                // draw it to this canvas and then alter it, because negative
                // kerning might make it overlap an existing character we shouldn't
                // be translating
                let trans_ctx = trans_canvas.getContext('2d');
                trans_ctx.clearRect(0, 0, glyph.width, glyph.height);
                font.draw_glyph(glyph, trans_ctx, 0, 0);

                // Now translate it in place
                let imagedata = trans_ctx.getImageData(0, 0, glyph.width, glyph.height);
                let pixels = imagedata.data;
                for (let i = 0; i < pixels.length; i += 4) {
                    if (pixels[i + 3] === 0)
                        continue;

                    // FIXME these are...  part of the font definition i guess?
                    let lightness = (pixels[i + 0] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
                    lightness = (lightness - font.lightness_range[0]) / (font.lightness_range[1] - font.lightness_range[0]);
                    let l = Math.max(0, Math.min(255, Math.floor(lightness * 256)));
                    //console.log(pixels[i], pixels[i+1], pixels[i+2], lightness, l);
                    for (let span of trans) {
                        if (span[0] <= l && l <= span[1]) {
                            let t = Math.floor(256 * (l - span[0]) / (span[1] - span[0]));
                            let c0 = span[2];
                            let c1 = span[3];
                            pixels[i + 0] = c0[0] + Math.floor((c1[0] - c0[0]) * t / 256);
                            pixels[i + 1] = c0[1] + Math.floor((c1[1] - c0[1]) * t / 256);
                            pixels[i + 2] = c0[2] + Math.floor((c1[2] - c0[2]) * t / 256);
                            //console.log("...", t, c0, c1, pixels[i], pixels[i+1], pixels[i+2]);
                            break;
                        }
                    }
                }
                trans_ctx.putImageData(imagedata, 0, 0);

                // Finally blit it onto the final canvas.  Note that we do NOT put
                // the image data directly, since that overwrites rather than
                // compositing
                ctx.drawImage(
                    trans_canvas,
                    0, 0, glyph.width, glyph.height,
                    px, py, glyph.width, glyph.height);
            }
            else {
                // Simple case: no translation is a straight blit
                font.draw_glyph(glyph, ctx, px, py);
            }
        }

        // Finally, scale up the offscreen canvas
        let final_ctx = final_canvas.getContext('2d');
        let aabb = [0, 0, final_canvas.width, final_canvas.height];
        if (background) {
            final_ctx.fillStyle = background;
            final_ctx.fillRect(...aabb);
        }
        else {
            final_ctx.clearRect(...aabb);
        }
        final_ctx.imageSmoothingEnabled = false;
        final_ctx.drawImage(this.buffer_canvas, ...aabb);

        return final_canvas;
    }
}

window.addEventListener('load', ev => {
    window._icon_of_sin = new BossBrain;
});
