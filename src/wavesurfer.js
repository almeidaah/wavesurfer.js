/**
 * Versão do WaveSurfer: 1.0.53
 * https://github.com/katspaugh/wavesurfer.js/tree/v1.0.53/dist
 *
 * Evitar alterar este arquivo diretamente, sempre que alterar testar o player, pois há implementações sobrescritas em outros pontos do sistema(wavesurfer-controller.js)
 * Adicionados os componentes de Mark/Region que permitem as marcações e o select na onda do áudio
 *
 * Alterada a versão .min para a versão expandida .js.
 *
 * O WaveSurfer é dividido da seguinte forma:
 *
 * WaveSurferUtil = Funções comum aos objetos do wavesurfer
 * WaveSurferObserver = Funções de adicionar e remover eventos relativos aos objetos do wavesurfer
 *
 * WaveSurfer.Mark = Marcadores(inseridos pelo usuário na onda)
 * WaveSurfer.Region = Regiões que podem ser selecionadas pelo usuário
 * WaveSurfer.WebAudio = Componente responsável por toda a lógica de player/playbackrate e buffer.
 * WaveSurfer.Drawer = Responsável por desenhar/redesenhar a onda no html
 * WaveSurfer.Drawer.Canva = Implementação 2d responsável também por desenhar a onda
 */

'use strict';

/* Common utilities */
var WaveSurferUtil = {

    extend: function (dest) {
        var sources = Array.prototype.slice.call(arguments, 1);
        sources.forEach(function (source) {
            Object.keys(source).forEach(function (key) {
                dest[key] = source[key];
            });
        });
        return dest;
    },

    getId: function () {
        return 'wavesurfer_' + Math.random().toString(32).substring(2);
    },

    max: function (values, min) {
        var max = -Infinity;
        for (var i = 0, len = values.length; i < len; i++) {
            var val = values[i];
            if (min != null) {
                val = Math.abs(val - min);
            }
            if (val > max) {
                max = val;
            }
        }
        return max;
    },

    ajax: function (options) {
        var ajax = Object.create(WaveSurferObserver);
        var xhr = new XMLHttpRequest();
        xhr.open(options.method || 'GET', options.url, true);
        xhr.responseType = options.responseType;
        xhr.addEventListener('progress', function (e) {
            ajax.fireEvent('progress', e);
        });
        xhr.addEventListener('load', function (e) {
            ajax.fireEvent('load', e);

            if (200 == xhr.status || 206 == xhr.status) {
                ajax.fireEvent('success', xhr.response, e);
            } else {
                ajax.fireEvent('error', e);
            }
        });
        xhr.addEventListener('error', function (e) {
            ajax.fireEvent('error', e);
        });
        xhr.send();
        ajax.xhr = xhr;
        return ajax;
    },

    /**
     * @see http://underscorejs.org/#throttle
     */
    throttle: function (func, wait, options) {
        var context, args, result;
        var timeout = null;
        var previous = 0;
        options || (options = {});
        var later = function () {
            previous = options.leading === false ? 0 : Date.now();
            timeout = null;
            result = func.apply(context, args);
            context = args = null;
        };
        return function () {
            var now = Date.now();
            if (!previous && options.leading === false) previous = now;
            var remaining = wait - (now - previous);
            context = this;
            args = arguments;
            if (remaining <= 0) {
                clearTimeout(timeout);
                timeout = null;
                previous = now;
                result = func.apply(context, args);
                context = args = null;
            } else if (!timeout && options.trailing !== false) {
                timeout = setTimeout(later, remaining);
            }
            return result;
        };
    }
};

/* Observer */
var WaveSurferObserver = {
    on: function (event, fn) {
        if (!this.handlers) {
            this.handlers = {};
        }

        var handlers = this.handlers[event];
        if (!handlers) {
            handlers = this.handlers[event] = [];
        }
        handlers.push(fn);
    },

    un: function (event, fn) {
        if (!this.handlers) {
            return;
        }

        var handlers = this.handlers[event];
        if (handlers) {
            if (fn) {
                for (var i = handlers.length - 1; i >= 0; i--) {
                    if (handlers[i] == fn) {
                        handlers.splice(i, 1);
                    }
                }
            } else {
                handlers.length = 0;
            }
        }
    },

    unAll: function () {
        this.handlers = null;
    },

    once: function (event, handler) {
        var my = this;
        var fn = function () {
            handler();
            setTimeout(function () {
                my.un(event, fn);
            }, 0);
        };
        this.on(event, fn);
    },

    fireEvent: function (event) {
        if (!this.handlers) {
            return;
        }
        var handlers = this.handlers[event];
        var args = Array.prototype.slice.call(arguments, 1);
        handlers && handlers.forEach(function (fn) {
            fn.apply(null, args);
        });
    }
};

var WaveSurfer = function () {

    /* Mark */
    var Mark = {
        defaultParams: {
            id: null,
            position: 0,
            percentage: 0,
            width: 1,
            color: '#333',
            draggable: false
        },

        init: function (options) {
            this.apply(
                WaveSurferUtil.extend({}, this.defaultParams, options)
            );
            return this;
        },

        getTitle: function () {
            return [
                ~~(this.position / 60),                   // minutes
                ('00' + ~~(this.position % 60)).slice(-2) // seconds
            ].join(':');
        },

        apply: function (options) {
            Object.keys(options).forEach(function (key) {
                if (key in this.defaultParams) {
                    this[key] = options[key];
                }
            }, this);
        },

        update: function (options) {
            this.apply(options);
            this.fireEvent('update');
        },

        remove: function () {
            this.fireEvent('remove');
            this.unAll();
        }
    };

    /* Region */

    var Region = {
        defaultParams: {
            id: null,
            startPosition: 0,
            endPosition: 0,
            startPercentage: 0,
            endPercentage: 0,
            color: 'rgba(0, 0, 255, 0.2)'
        },

        init: function (options) {
            this.apply(
                WaveSurferUtil.extend({}, this.defaultParams, options)
            );
            return this;
        },

        apply: function (options) {
            Object.keys(options).forEach(function (key) {
                if (key in this.defaultParams) {
                    this[key] = options[key];
                }
            }, this);
        },

        update: function (options) {
            this.apply(options);
            this.fireEvent('update');
        },

        remove: function () {
            this.fireEvent('remove');
            this.unAll();
        }
    };

    WaveSurferUtil.extend(Mark, WaveSurferObserver);
    WaveSurferUtil.extend(Region, WaveSurferObserver);


    'use strict';

    WaveSurfer.WebAudio = {
        scriptBufferSize: 256,
        PLAYING_STATE: 0,
        PAUSED_STATE: 1,
        FINISHED_STATE: 2,

        supportsWebAudio: function () {
            return !!(window.AudioContext || window.webkitAudioContext);
        },

        getAudioContext: function () {
            if (!WaveSurfer.WebAudio.audioContext) {
                WaveSurfer.WebAudio.audioContext = new (
                    window.AudioContext || window.webkitAudioContext
                );
            }
            return WaveSurfer.WebAudio.audioContext;
        },

        getOfflineAudioContext: function (sampleRate) {
            if (!WaveSurfer.WebAudio.offlineAudioContext) {
                WaveSurfer.WebAudio.offlineAudioContext = new (
                    window.OfflineAudioContext || window.webkitOfflineAudioContext
                )(1, 2, sampleRate);
            }
            return WaveSurfer.WebAudio.offlineAudioContext;
        },

        init: function (params) {
            this.params = params;
            this.ac = params.audioContext || this.getAudioContext();

            this.loop = false;
            this.prevFrameTime = 0;

            this.lastPlay = this.ac.currentTime;
            this.startPosition = 0;
            this.scheduledPause = null;

            this.states = [
                Object.create(WaveSurfer.WebAudio.state.playing),
                Object.create(WaveSurfer.WebAudio.state.paused),
                Object.create(WaveSurfer.WebAudio.state.finished)
            ];

            this.createVolumeNode();
            this.createScriptNode();
            this.createAnalyserNode();

            this.setState(this.PAUSED_STATE);
            this.setPlaybackRate(this.params.audioRate);
        },

        disconnectFilters: function () {
            if (this.filters) {
                this.filters.forEach(function (filter) {
                    filter && filter.disconnect();
                });
                this.filters = null;
                // Reconnect direct path
                this.analyser.connect(this.gainNode);
            }
        },

        setState: function (state) {
            if (this.state !== this.states[state]) {
                this.state = this.states[state];
                this.state.init.call(this);
            }
        },

        // Unpacked filters
        setFilter: function () {
            this.setFilters([].slice.call(arguments));
        },

        /**
         * @param {Array} filters Packed ilters array
         */
        setFilters: function (filters) {
            // Remove existing filters
            this.disconnectFilters();

            // Insert filters if filter array not empty
            if (filters && filters.length) {
                this.filters = filters;

                // Disconnect direct path before inserting filters
                this.analyser.disconnect();

                // Connect each filter in turn
                filters.reduce(function (prev, curr) {
                    prev.connect(curr);
                    return curr;
                }, this.analyser).connect(this.gainNode);
            }

        },

        createScriptNode: function () {
            if (this.ac.createScriptProcessor) {
                this.scriptNode = this.ac.createScriptProcessor(this.scriptBufferSize);
            } else {
                this.scriptNode = this.ac.createJavaScriptNode(this.scriptBufferSize);
            }

            this.scriptNode.connect(this.ac.destination);
        },

        addOnAudioProcess: function () {
            var my = this;

            this.scriptNode.onaudioprocess = function () {
                var time = my.getCurrentTime();

                if (time >= my.getDuration()) {
                    my.setState(my.FINISHED_STATE);
                    my.fireEvent('pause');
                } else if (time >= my.scheduledPause) {
                    my.setState(my.PAUSED_STATE);
                    my.fireEvent('pause');
                } else if (my.state === my.states[my.PLAYING_STATE]) {
                    my.onPlayFrame(time);
                    my.fireEvent('audioprocess', time);

                }
            };
        },

        removeOnAudioProcess: function () {
            this.scriptNode.onaudioprocess = null;
        },

        onPlayFrame: function (time) {
            if (this.scheduledPause != null) {
                if (this.prevFrameTime >= this.scheduledPause) {
                    this.pause();
                }
            }

            if (this.loop) {
                if (
                    this.prevFrameTime > this.loopStart &&
                    this.prevFrameTime <= this.loopEnd &&
                    time > this.loopEnd
                ) {
                    /* TODO: Memory leak ainda não resolvido.
                     *       Neste ponto o player volta para o começo de uma seleção de audio feita com o mouse no gráfico.
                     *       A funcionalidade está OK, porém ao executar o método "play" abaixo, a memória não é liberada ao fechar a tela de detalhe de evento
                     *       Caso o método "play" não seja executado, a memória é liberada normalmente */
                    this.play(this.loopStart);
                }
            }

            this.prevFrameTime = time;
        },

        createAnalyserNode: function () {
            this.analyser = this.ac.createAnalyser();
            this.analyser.connect(this.gainNode);
        },

        /**
         * Create the gain node needed to control the playback volume.
         */
        createVolumeNode: function () {
            // Create gain node using the AudioContext
            if (this.ac.createGain) {
                this.gainNode = this.ac.createGain();
            } else {
                this.gainNode = this.ac.createGainNode();
            }
            // Add the gain node to the graph
            this.gainNode.connect(this.ac.destination);
        },

        /**
         * Set the gain to a new value.
         *
         * @param {Number} newGain The new gain, a floating point value
         * between 0 and 1. 0 being no gain and 1 being maximum gain.
         */
        setVolume: function (newGain) {
            this.gainNode.gain.value = newGain;
        },

        /**
         * Get the current gain.
         *
         * @returns {Number} The current gain, a floating point value
         * between 0 and 1. 0 being no gain and 1 being maximum gain.
         */
        getVolume: function () {
            return this.gainNode.gain.value;
        },

        decodeArrayBuffer: function (arraybuffer, callback, errback) {
            if (!this.offlineAc) {
                this.offlineAc = this.getOfflineAudioContext(this.ac ? this.ac.sampleRate : 44100);
            }
            this.offlineAc.decodeAudioData(arraybuffer, (function (data) {
                callback(data);
            }).bind(this), errback);
        },

        // /**
        //  * Compute the max and min value of the waveform when broken into
        //  * <length> subranges.
        //  * @param {Number} How many subranges to break the waveform into.
        //  * @returns {Array} Array of 2*<length> peaks or array of arrays
        //  * of peaks consisting of (max, min) values for each subrange.
        //  */
        // getPeaks: function (length) {
        //     var sampleSize = this.buffer.length / length;
        //     var sampleStep = ~~(sampleSize / 10) || 1;
        //     var channels = this.buffer.numberOfChannels;
        //     var splitPeaks = [];
        //     var mergedPeaks = [];
        //
        //     for (var c = 0; c < channels; c++) {
        //         var peaks = splitPeaks[c] = [];
        //         var chan = this.buffer.getChannelData(c);
        //
        //         for (var i = 0; i < length; i++) {
        //             var start = ~~(i * sampleSize);
        //             var end = ~~(start + sampleSize);
        //             var min = chan[0];
        //             var max = chan[0];
        //
        //             for (var j = start; j < end; j += sampleStep) {
        //                 var value = chan[j];
        //
        //                 if (value > max) {
        //                     max = value;
        //                 }
        //
        //                 if (value < min) {
        //                     min = value;
        //                 }
        //             }
        //
        //             peaks[2 * i] = max;
        //             peaks[2 * i + 1] = min;
        //
        //             if (c == 0 || max > mergedPeaks[2 * i]) {
        //                 mergedPeaks[2 * i] = max;
        //             }
        //
        //             if (c == 0 || min < mergedPeaks[2 * i + 1]) {
        //                 mergedPeaks[2 * i + 1] = min;
        //             }
        //         }
        //     }
        //
        //     return this.params.splitChannels ? splitPeaks : mergedPeaks;
        // },

        /**
         * @parameter {int} container length
         * @returns {Float32Array} Array of peaks.
         */
        getPeaks: function (length) {
            var buffer = this.buffer;
            var sampleSize = buffer.length / length;
            var sampleStep = ~~(sampleSize / 10) || 1;
            var channels = buffer.numberOfChannels;
            var peaks_list = [];

            for (var c = 0; c < channels; c++) {
                var peaks = new Float32Array(length);
                var chan = buffer.getChannelData(c);
                for (var i = 0; i < length; i++) {
                    var start = ~~(i * sampleSize);
                    var end = ~~(start + sampleSize);
                    var max = 0;
                    for (var j = start; j < end; j += sampleStep) {
                        var value = chan[j];
                        if (value > max) {
                            max = value;
                            // faster than Math.abs
                        } else if (-value > max) {
                            max = -value;
                        }
                    }
                    if (c == 0 || max > peaks[i]) {
                        peaks[i] = max;
                    }
                }
                peaks_list[c] = peaks;
            }

            return peaks_list;
        },
        getPlayedPercents: function () {
            return this.state.getPlayedPercents.call(this);
        },

        disconnectSource: function () {
            if (this.source) {
                this.source.disconnect();
            }
        },

        destroy: function () {
            if (!this.isPaused()) {
                this.pause();
            }
            this.unAll();
            this.buffer = null;
            this.disconnectFilters();
            this.disconnectSource();
            this.gainNode.disconnect();
            this.scriptNode.disconnect();
            this.analyser.disconnect();
        },

        updateSelection: function (startPercent, endPercent) {
            var duration = this.getDuration();
            this.loop = true;
            this.loopStart = duration * startPercent;
            this.loopEnd = duration * endPercent;
        },

        clearSelection: function () {
            this.loop = false;
            this.loopStart = 0;
            this.loopEnd = 0;
        },


        load: function (buffer) {
            this.startPosition = 0;
            this.lastPlay = this.ac.currentTime;
            this.buffer = buffer;
            this.createSource();
        },

        createSource: function () {
            this.disconnectSource();
            this.source = this.ac.createBufferSource();
            this.source.playbackRate.value = this.playbackRate;
            this.source.buffer = this.buffer;
            this.source.connect(this.analyser);
        },

        isPaused: function () {
            return this.state !== this.states[this.PLAYING_STATE];
        },

        getDuration: function () {
            if (!this.buffer) {
                return 0;
            }
            return this.buffer.duration;
        },

        seekTo: function (start, end) {
            this.scheduledPause = null;

            if (start == null) {
                start = this.getCurrentTime();
                if (start >= this.getDuration()) {
                    start = 0;
                }
            }
            if (end == null) {
                end = this.getDuration();
            }

            this.startPosition = start;
            this.lastPlay = this.ac.currentTime;

            if (this.state === this.states[this.FINISHED_STATE]) {
                this.setState(this.PAUSED_STATE);
            }

            return {start: start, end: end};
        },

        getPlayedTime: function () {
            return (this.ac.currentTime - this.lastPlay) * this.playbackRate;
        },

        /**
         * Plays the loaded audio region.
         *
         * @param {Number} start Start offset in seconds,
         * relative to the beginning of a clip.
         * @param {Number} end When to stop
         * relative to the beginning of a clip.
         */
        play: function (start, end) {
            // need to re-create source on each playback
            this.createSource();

            this.createScriptNode();

            var adjustedTime = this.seekTo(start, end);

            start = adjustedTime.start;
            end = adjustedTime.end;

            this.scheduledPause = end;

            this.source.start(0, start, end - start);

            this.setState(this.PLAYING_STATE);

            this.fireEvent('play');
        },

        /**
         * Pauses the loaded audio.
         */
        pause: function () {
            this.scheduledPause = null;

            this.startPosition += this.getPlayedTime();
            this.source && this.source.stop(0);

            this.setState(this.PAUSED_STATE);

            this.fireEvent('pause');
        },

        /**
         *   Returns the current time in seconds relative to the audioclip's duration.
         */
        getCurrentTime: function () {
            return this.state.getCurrentTime.call(this);
        },

        /**
         * Set the audio source playback rate.
         */
        setPlaybackRate: function (value) {
            value = value || 1;
            if (this.isPaused()) {
                this.playbackRate = value;
            } else {
                this.pause();
                this.playbackRate = value;
                this.play();
            }
        }
    };

    WaveSurfer.WebAudio.state = {};

    WaveSurfer.WebAudio.state.playing = {
        init: function () {
            this.addOnAudioProcess();
        },
        getPlayedPercents: function () {
            var duration = this.getDuration();
            return (this.getCurrentTime() / duration) || 0;
        },
        getCurrentTime: function () {
            return this.startPosition + this.getPlayedTime();
        }
    };

    WaveSurfer.WebAudio.state.paused = {
        init: function () {
            this.removeOnAudioProcess();
        },
        getPlayedPercents: function () {
            var duration = this.getDuration();
            return (this.getCurrentTime() / duration) || 0;
        },
        getCurrentTime: function () {
            return this.startPosition;
        }
    };

    WaveSurfer.WebAudio.state.finished = {
        init: function () {
            this.removeOnAudioProcess();
            this.fireEvent('finish');
        },
        getPlayedPercents: function () {
            return 1;
        },
        getCurrentTime: function () {
            return this.getDuration();
        }
    };

    WaveSurferUtil.extend(WaveSurfer.WebAudio, WaveSurferObserver);

    /* Drawer */
    var Drawer = {
        init: function (container, params) {
            this.container = container;
            this.params = params;
            this.pixelRatio = this.params.pixelRatio;

            this.width = 0;
            this.height = params.height * this.pixelRatio;
            this.containerWidth = this.container.clientWidth;
            this.interact = this.params.interact;

            this.lastPos = 0;

            this.createWrapper();
            this.createElements();
        },

        createWrapper: function () {
            this.wrapper = this.container.appendChild(
                document.createElement('wave')
            );

            this.style(this.wrapper, {
                display: 'block',
                position: 'relative',
                userSelect: 'none',
                webkitUserSelect: 'none',
                height: (this.params.scrollParent ? 30 : 0) + this.params.height + 'px'
            });

            if (this.params.fillParent || this.params.scrollParent) {
                this.style(this.wrapper, {
                    width: '100%',
                    overflowX: this.params.scrollParent ? 'scroll' : 'hidden',
                    overflowY: 'hidden'
                });
            }

            this.setupWrapperEvents();
        },

        handleEvent: function (e) {
            e.preventDefault();
            var bbox = this.wrapper.getBoundingClientRect();
            return ((e.clientX - bbox.left + this.wrapper.scrollLeft) / this.scrollWidth) || 0;
        },

        setupWrapperEvents: function () {
            var my = this;

            this.wrapper.addEventListener('mousedown', function (e) {
                if (my.interact) {
                    my.fireEvent('mousedown', my.handleEvent(e), e);
                }
            });

            this.wrapper.addEventListener('mouseup', function (e) {
                if (my.interact) {
                    my.fireEvent('mouseup', e);
                }
            });

            this.params.dragSelection && (function () {
                var drag = {};

                var onMouseUp = function () {
                    drag.startPercentage = drag.endPercentage = null;
                };
                document.addEventListener('mouseup', onMouseUp);
                my.on('destroy', function () {
                    document.removeEventListener('mouseup', onMouseUp);
                });

                my.wrapper.addEventListener('mousedown', function (e) {
                    drag.startPercentage = my.handleEvent(e);
                });

                my.wrapper.addEventListener('mousemove', WaveSurferUtil.throttle(function (e) {
                    e.stopPropagation();
                    if (drag.startPercentage != null) {
                        drag.endPercentage = my.handleEvent(e);
                        if (e.ctrlKey || e.shiftKey || e.altKey) {
                            my.fireEvent('drag-unique', drag);
                        } else {
                            my.fireEvent('drag', drag);
                        }
                    }
                }, 30));

                my.wrapper.addEventListener('dblclick', function () {
                    my.fireEvent('drag-clear', drag);
                });
            }());
        },

        drawPeaks: function (peaks, length) {
            this.resetScroll();
            this.setWidth(length);

            // Normalize peaks max?
            var max = (this.params.normalize) ? WaveSurferUtil.max(peaks) : 1;
            this.drawWave(peaks, max);
        },

        style: function (el, styles) {
            Object.keys(styles).forEach(function (prop) {
                if (el.style[prop] != styles[prop]) {
                    el.style[prop] = styles[prop];
                }
            });
            return el;
        },

        resetScroll: function () {
            if (this.wrapper) {
                this.wrapper.scrollLeft = 0;
            }
        },

        recenter: function (percent) {
            var position = this.scrollWidth * percent;
            this.recenterOnPosition(position, true);
        },

        recenterOnPosition: function (position, immediate) {
            var scrollLeft = this.wrapper.scrollLeft;
            var half = ~~(this.containerWidth / 2);
            var target = position - half;
            var offset = target - scrollLeft;

            // if the cursor is currently visible...
            if (!immediate && offset >= -half && offset < half) {
                // we'll limit the "re-center" rate.
                var rate = 5;
                offset = Math.max(-rate, Math.min(rate, offset));
                target = scrollLeft + offset;
            }

            if (offset != 0) {
                this.wrapper.scrollLeft = target;
            }
        },

        getWidth: function () {
            return Math.round(this.containerWidth * this.pixelRatio);
        },

        setWidth: function (width) {
            if (width == this.width) {
                return;
            }

            this.width = width;
            this.scrollWidth = ~~(this.width / this.pixelRatio);
            this.containerWidth = this.container.clientWidth;

            if (!this.params.fillParent && !this.params.scrollParent) {
                this.style(this.wrapper, {
                    width: this.scrollWidth + 'px'
                });
            }

            this.updateWidth();
        },

        progress: function (progress) {
            // this method is called a lot while playing the audio, it needs to be very fast
            var pos = Math.round(progress * this.width);

            if ((pos != this.lastPos) && ((pos < this.lastPos) || ((pos - this.lastPos) >= 1))) {
                this.lastPos = pos;
                if (this.params.scrollParent) {
                    var newPos = ~~(this.scrollWidth * progress);
                    this.recenterOnPosition(newPos);
                }
                this.updateProgress(progress);
            }
        },

        destroy: function () {
            this.unAll();
            this.container.removeChild(this.wrapper);
            this.wrapper = null;
        },

        updateSelection: function (startPercent, endPercent) {
            this.startPercent = startPercent;
            this.endPercent = endPercent;

            if (!this.params.scrollParent) { //draw selection only when not streaming
                this.drawSelection();
            }
        },

        clearSelection: function (mark0, mark1) {
            this.startPercent = null;
            this.endPercent = null;
            this.eraseSelection();
            this.eraseSelectionMarks(mark0, mark1, this.channel);
        },


        /* Renderer-specific methods */
        createElements: function () {
        },

        updateWidth: function () {
        },

        drawWave: function (peaks, max) {
        },

        clearWave: function () {
        },

        updateProgress: function (position) {
        },

        addMark: function (mark, channel) {
        },

        removeMark: function (mark, channel) {
        },

        updateMark: function (mark, channel) {
        },

        addRegion: function (region) {
        },

        removeRegion: function (region) {
        },

        updateRegion: function (region) {
        },

        drawSelection: function () {
        },

        eraseSelection: function () {
        },

        eraseSelectionMarks: function (mark0, mark1, channel) {
        }
    };

    WaveSurferUtil.extend(Drawer, WaveSurferObserver);

    /* Drawer Canvas */
    Drawer.Canvas = Object.create(Drawer);

    WaveSurferUtil.extend(Drawer.Canvas, {
        createElements: function () {
            var waveCanvas = this.wrapper.appendChild(
                this.style(document.createElement('canvas'), {
                    position: 'absolute',
                    zIndex: 1
                })
            );

            this.progressWave = this.wrapper.appendChild(
                this.style(document.createElement('wave'), {
                    position: 'absolute',
                    zIndex: 2,
                    overflow: 'hidden',
                    width: '0',
                    height: (this.params.scrollParent ? 30 : 0) + this.params.height + 'px',
                    borderRight: [
                        this.params.cursorWidth + 'px',
                        'solid',
                        this.params.cursorColor
                    ].join(' ')
                })
            );

            var progressCanvas = this.progressWave.appendChild(
                document.createElement('canvas')
            );

            var selectionZIndex = 0;

            if (this.params.selectionForeground) {
                selectionZIndex = 3;
            }

            var selectionCanvas = this.wrapper.appendChild(
                this.style(document.createElement('canvas'), {
                    position: 'absolute',
                    zIndex: selectionZIndex
                })
            );

            this.waveCc = waveCanvas.getContext('2d');
            this.progressCc = progressCanvas.getContext('2d');
            this.selectionCc = selectionCanvas.getContext('2d');
        },

        updateWidth: function () {
            var width = Math.round(this.width / this.pixelRatio);
            [
                this.waveCc,
                this.progressCc,
                this.selectionCc
            ].forEach(function (cc) {
                cc.canvas.width = this.width;
                cc.canvas.height = this.height;
                this.style(cc.canvas, {width: width + 'px'});
            }, this);

            this.clearWave();
        },

        clearWave: function () {
            this.waveCc.clearRect(0, 0, this.width, this.height);
            this.progressCc.clearRect(0, 0, this.width, this.height);
        },

        drawWave: function (peaks, max) {
            // A half-pixel offset makes lines crisp
            var pxOffSet = 0.5 / this.params.pixelRatio;
            // Wave height
            var height = this.params.height * this.params.pixelRatio;
            // halfH is middle of the graph, the median line
            var halfH = height / 2;
            // Wave length
            var length = peaks.length;
            // Wave scale
            var scale = 1;
            if (this.params.fillParent && this.width != length) {
                scale = this.width / length;
            }

            // Set fill style for canvas
            this.waveCc.fillStyle = this.params.waveColor;
            if (this.progressCc) {
                this.progressCc.fillStyle = this.params.progressColor;
            }

            // Draw
            [this.waveCc, this.progressCc].forEach(function (cc) {
                if (!cc) {
                    // No canvas context no drawing
                    return;
                }

                // Start the drawing
                cc.beginPath();
                // Starting point
                cc.moveTo(pxOffSet, halfH);

                // Draw all peaks "bellow" halfH
                for (var i = 0; i < length; i++) {
                    var h = Math.round(peaks[i] / max * halfH);
                    cc.lineTo(i * scale + pxOffSet, halfH + h);
                }
                cc.lineTo(this.width + pxOffSet, halfH);

                // Go back to the starting point
                cc.moveTo(pxOffSet, halfH);

                // Draw all peaks "above" halfH
                for (var i = 0; i < length; i++) {
                    var h = Math.round(peaks[i] / max * halfH);
                    cc.lineTo(i * scale + pxOffSet, halfH - h);
                }
                cc.lineTo(this.width + pxOffSet, halfH);

                // Finish the drawing
                cc.closePath();
                // Just fill it and you have a solid graph
                cc.fill();

                // Always draw a median line, that represents halfH
                cc.fillRect(0, halfH - pxOffSet, this.width, pxOffSet);
            }, this);
        },

        updateProgress: function (progress) {
            var pos = (progress < this.width) ? (Math.round(this.width * progress) / this.pixelRatio) : this.width;
            this.style(this.progressWave, {width: pos + 'px'});
        },

        addMark: function (mark, channel) {
            var my = this;
            var markEl = document.createElement('mark');
            // The marker must be draw on each channel and element ids on DOM must be unique
            var uniqueId = ['chn-', channel, '-'].join('') + mark.id

            markEl.id = uniqueId;
            this.wrapper.appendChild(markEl);
            var handler;

            if (mark.draggable) {
                handler = document.createElement('handler');
                handler.id = uniqueId + '-handler';
                handler.className = 'wavesurfer-handler';
                markEl.appendChild(handler);
            }

            markEl.addEventListener('mouseover', function (e) {
                my.fireEvent('mark-over', mark, e);
            });
            markEl.addEventListener('mouseleave', function (e) {
                my.fireEvent('mark-leave', mark, e);
            });
            markEl.addEventListener('click', function (e) {
                my.fireEvent('mark-click', mark, e);
            });

            mark.draggable && (function () {
                var drag = {};

                var onMouseUp = function (e) {
                    e.stopPropagation();
                    drag.startPercentage = drag.endPercentage = null;
                };
                document.addEventListener('mouseup', onMouseUp);
                my.on('destroy', function () {
                    document.removeEventListener('mouseup', onMouseUp);
                });

                handler.addEventListener('mousedown', function (e) {
                    e.stopPropagation();
                    drag.startPercentage = my.handleEvent(e);
                });

                my.wrapper.addEventListener('mousemove', WaveSurferUtil.throttle(function (e) {
                    e.stopPropagation();
                    if (drag.startPercentage != null) {
                        drag.endPercentage = my.handleEvent(e);
                        my.fireEvent('drag-mark', drag, mark);
                    }
                }, 30));
            }());

            this.updateMark(mark, channel);

            if (mark.draggable) {
                this.style(handler, {
                    position: 'absolute',
                    cursor: 'col-resize',
                    width: '12px',
                    height: '15px'
                });
                this.style(handler, {
                    left: handler.offsetWidth / 2 * -1 + 'px',
                    top: markEl.offsetHeight / 2 - handler.offsetHeight / 2 + 'px',
                    backgroundColor: mark.color
                });
            }
        },

        updateMark: function (mark, channel) {
            // The marker must be draw on each channel and element ids on DOM must be unique
            var uniqueId = ['chn-', channel, '-'].join('') + mark.id;
            var markEl = document.getElementById(uniqueId);
            markEl.title = mark.getTitle();
            this.style(markEl, {
                height: '100%',
                position: 'absolute',
                zIndex: 4,
                width: mark.width + 'px',
                left: Math.max(0, Math.round(
                    mark.percentage * this.scrollWidth - mark.width / 2
                )) + 'px',
                backgroundColor: mark.color
            });
        },

        removeMark: function (mark, channel) {
            // The marker must be draw on each channel and element ids on DOM must be unique
            if (mark != null && mark.id != null) {
                var uniqueId = ['chn-', channel, '-'].join('') + mark.id;
                try {
                    $(this.wrapper).find(uniqueId).remove();
                } catch (e) {
                    console.error(e);
                }
            }
        },

        addRegion: function (region) {
            var my = this;
            var regionEl = document.createElement('region');
            regionEl.id = region.id;
            this.wrapper.appendChild(regionEl);

            regionEl.addEventListener('mouseover', function (e) {
                my.fireEvent('region-over', region, e);
            });
            regionEl.addEventListener('mouseleave', function (e) {
                my.fireEvent('region-leave', region, e);
            });
            regionEl.addEventListener('click', function (e) {
                my.fireEvent('region-click', region, e);
            });

            this.updateRegion(region);
        },

        updateRegion: function (region) {
            var regionEl = document.getElementById(region.id);
            var left = Math.max(0, Math.round(
                region.startPercentage * this.scrollWidth));
            var width = Math.max(0, Math.round(
                region.endPercentage * this.scrollWidth)) - left;

            this.style(regionEl, {
                height: '100%',
                position: 'absolute',
                zIndex: 4,
                left: left + 'px',
                top: '0px',
                width: width + 'px',
                backgroundColor: region.color
            });
        },

        removeRegion: function (region) {
            var regionEl = document.getElementById(region.id);
            if (regionEl) {
                this.wrapper.removeChild(regionEl);
            }
        },

        drawSelection: function () {
            this.eraseSelection();

            this.selectionCc.fillStyle = this.params.selectionColor;
            var x = this.startPercent * this.width;
            var width = this.endPercent * this.width - x;

            this.selectionCc.fillRect(x, 0, width, this.height);
        },

        eraseSelection: function () {
            this.selectionCc.clearRect(0, 0, this.width, this.height);
        },

        eraseSelectionMarks: function (mark0, mark1, channel) {
            this.removeMark(mark0, channel);
            this.removeMark(mark1, channel);
        }
    });

    /* WaveSurfer Core */
    var waveSurferInstance = {
        defaultParams: {
            height: 128,
            waveColor: '#999',
            progressColor: '#555',
            cursorColor: '#333',
            selectionColor: '#0fc',
            selectionBorder: false,
            selectionForeground: false,
            selectionBorderColor: '#000',
            cursorWidth: 1,
            markerWidth: 2,
            skipLength: 2,
            minPxPerSec: 10,
            samples: 3,
            pixelRatio: window.devicePixelRatio,
            fillParent: true,
            scrollParent: false,
            normalize: true,
            audioContext: null,
            container: null,
            renderer: 'Canvas',
            dragSelection: true,
            loopSelection: true,
            audioRate: 1,
            interact: true,
            nameSuffix: true,
            animationLoopId: 0
        },

        init: function (params) {

            // Extract relevant parameters (or defaults)
            waveSurferInstance.params = WaveSurferUtil.extend({}, waveSurferInstance.defaultParams, params);

            waveSurferInstance.container = 'string' == typeof params.container ?
                document.querySelector(waveSurferInstance.params.container) :
                waveSurferInstance.params.container;

            if (!waveSurferInstance.container) {
                throw new Error('wavesurfer.js: container element not found');
            }

            // Marker objects
            waveSurferInstance.markers = {};
            waveSurferInstance.once('marked', waveSurferInstance.bindMarks.bind(waveSurferInstance));
            waveSurferInstance.once('region-created', waveSurferInstance.bindRegions.bind(waveSurferInstance));

            // Region objects
            waveSurferInstance.regions = {};

            // Used to save the current volume when muting so we can
            // restore once unmuted
            waveSurferInstance.savedVolume = 0;
            // The current muted state
            waveSurferInstance.isMuted = false;

            waveSurferInstance.loopSelection = waveSurferInstance.params.loopSelection;
            waveSurferInstance.minPxPerSec = waveSurferInstance.params.minPxPerSec;

            waveSurferInstance.bindUserAction();

            waveSurferInstance.createBackend();
        },

        bindUserAction: function () {
            // iOS requires user input to start loading audio
            var my = waveSurferInstance;
            var onUserAction = function () {
                my.fireEvent('user-action');
            };
            document.addEventListener('mousedown', onUserAction);
            document.addEventListener('keydown', onUserAction);
            waveSurferInstance.on('destroy', function () {
                document.removeEventListener('mousedown', onUserAction);
                document.removeEventListener('keydown', onUserAction);
            });
        },

        /**
         * Used with loadStream.
         */
        createMedia: function (url) {
            //cleaning any previous media.
            var prevMedia = waveSurferInstance.container.querySelector('audio');
            if (prevMedia) {
                prevMedia.removeAttribute("src");
                prevMedia.pause();
                prevMedia.src = '';
                waveSurferInstance.container.removeChild(prevMedia);
            }

            var my = waveSurferInstance;

            var media = document.createElement('audio');
            media.controls = false;
            media.id = "wavesurfer-audiotag";
            /*
             * Autoplay is enabled by stream and disabled otherwise! Also, the original
             * 'media.autoplay = true;' does not trigger all wavesurfer necessary methods.
             * Look at wavesurfer-controller.js at method loadWaveSurfer, line
             * waveSurferInstance.waveSurfer.playPause(); when audio_state == "OPEN"
             */
            media.autoplay = false; //by default is false, but stream starts playing
            media.src = url;

            media.addEventListener('error', function () {
                my.fireEvent('error', 'Error loading media element');
            });

            waveSurferInstance.container.appendChild(media);

            return media;
        },

        getNumberOfChannels: function () {
            if (waveSurferInstance.backend.buffer) {
                return waveSurferInstance.backend.buffer.numberOfChannels;
            } else if (waveSurferInstance.media) {
                // TODO: There is no way to get number of channels from HTMLMediaElement
                // media.mozChannels is not reliable, so we use 1
                return 1;
            } else {
                return 1;
            }
        },

        createDrawers: function () {
            var self = waveSurferInstance;

            function bindEvents(drawer) {
                drawer.on('redraw', function () {
                    self.drawBuffer();
                    drawer.progress(my.backend.getPlayedPercents());
                });

                self.on('progress', function (progress) {
                    drawer.progress(progress);
                });

                // Click-to-seek
                drawer.on('mousedown', function (progress) {
                    setTimeout(function () {
                        self.seekTo(progress);
                    }, 0);
                });

                // Drag selection or marker events
                if (self.params.dragSelection) {
                    drawer.on('drag-unique', function (drag) {
                        if (self.getSelection()) {
                            self.clearSelection();
                        }
                        self.dragging = true;
                        self.updateSelection(drag, drawer);
                    });
                    drawer.on('drag', function (drag) {
                        self.dragging = true;
                        self.updateSelection(drag, null);
                    });
                    drawer.on('drag-clear', function () {
                        self.clearSelection();
                    });
                }

                drawer.on('drag-mark', function (drag, mark) {
                    mark.fireEvent('drag', drag);
                });

                // Mouseup for plugins
                drawer.on('mouseup', function (e) {
                    self.fireEvent('mouseup', e);
                    self.dragging = false;
                });
            }

            function pushDrawers(channels) {
                self.drawers = [];

                // One drawer for each channel
                for (var i = 0; i < channels; ++i) {
                    // Create drawer
                    var drawer = Object.create(Drawer[self.params.renderer])
                    drawer.init(self.container, self.params);
                    drawer.waveCc.canvas.id = "canvas-wavecc-" + i + "-" + self.nameSuffix;
                    // Associate channel
                    drawer.channel = i;
                    // Bind events
                    bindEvents(drawer);
                    // Push to list
                    self.drawers.push(drawer);
                }
            }

            // Wait for audio
            if (waveSurferInstance.isAudioLoaded) {
                pushDrawers(waveSurferInstance.getNumberOfChannels());
                waveSurferInstance.fireEvent('drawers-created');
            } else {
                waveSurferInstance.backend.on('ready', function () {
                    pushDrawers(self.getNumberOfChannels());
                    waveSurferInstance.fireEvent('drawers-created');
                });
            }
        },

        createBackend: function () {
            var my = waveSurferInstance;

            waveSurferInstance.backend = Object.create(WaveSurfer.WebAudio);

            waveSurferInstance.backend.on('play', function () {
                my.fireEvent('play');
            });

            waveSurferInstance.on('play', function () {
                // cria um id único para identificar o ultimo acionamento do método restartAnimationLoop
                my.defaultParams.animationLoopId = Date.now();
                my.restartAnimationLoop(my.defaultParams.animationLoopId);
            });

            waveSurferInstance.backend.init(waveSurferInstance.params);
        },

        restartAnimationLoop: function (animationLoopId) {
            var my = waveSurferInstance;
            var requestFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame;
            var frame = function () {
                // garante que eventos antigos do requestAnimationFrame parem de ser executados assim que um novo Play é executado no player
                var isMostRecentAnimationLoop = animationLoopId === my.defaultParams.animationLoopId;
                if (my.backend != null && !my.backend.isPaused() && (isMostRecentAnimationLoop)) {
                    my.fireEvent('progress', my.backend.getPlayedPercents());
                    requestFrame(frame);
                }
            };
            frame();
        },

        getDuration: function () {
            return waveSurferInstance.backend.getDuration();
        },

        getCurrentTime: function () {
            return waveSurferInstance.backend.getCurrentTime();
        },

        play: function (start, end) {
            waveSurferInstance.backend.play(start, end);
        },

        pause: function () {
            waveSurferInstance.backend.pause();
        },

        playPause: function () {
            waveSurferInstance.backend.isPaused() ? waveSurferInstance.play() : waveSurferInstance.pause();
        },

        skipBackward: function (seconds) {
            waveSurferInstance.skip(seconds || -waveSurferInstance.params.skipLength);
        },

        skipForward: function (seconds) {
            waveSurferInstance.skip(seconds || waveSurferInstance.params.skipLength);
        },

        skip: function (offset) {
            var timings = waveSurferInstance.timings(offset);
            var progress = timings[0] / timings[1];

            waveSurferInstance.seekTo(progress);
        },

        seekTo: function (progress) {
            if (!waveSurferInstance.seekInProgress) {
                waveSurferInstance.seekInProgress = true;
                try {
                    var paused = waveSurferInstance.backend.isPaused();
                    // avoid small scrolls while paused seeking
                    var oldScrollParent = waveSurferInstance.params.scrollParent;
                    if (paused) {
                        waveSurferInstance.params.scrollParent = false;
                        // avoid noise while seeking
                        waveSurferInstance.savedVolume = waveSurferInstance.backend.getVolume();
                        waveSurferInstance.backend.setVolume(0);
                    } else {
                        waveSurferInstance.pause();
                    }
                    waveSurferInstance.play(progress * waveSurferInstance.getDuration());
                    if (paused) {
                        waveSurferInstance.pause();
                        waveSurferInstance.backend.setVolume(waveSurferInstance.savedVolume);
                    }
                    waveSurferInstance.params.scrollParent = oldScrollParent;
                    waveSurferInstance.fireEvent('seek', progress);
                } finally {
                    waveSurferInstance.seekInProgress = false;
                }
            }
        },

        stop: function () {
            waveSurferInstance.pause();
            waveSurferInstance.seekTo(0);
            if (waveSurferInstance.drawers) {
                for (var i = 0; i < waveSurferInstance.drawers.length; ++i) {
                    waveSurferInstance.drawers[i].progress(0);
                }
            }
        },

        /**
         * Set the playback volume.
         *
         * @param {Number} newVolume A value between 0 and 1, 0 being no
         * volume and 1 being full volume.
         */
        setVolume: function (newVolume) {
            waveSurferInstance.backend.setVolume(newVolume);
        },

        /**
         * Toggle the volume on and off. It not currenly muted it will
         * save the current volume value and turn the volume off.
         * If currently muted then it will restore the volume to the saved
         * value, and then rest the saved value.
         */
        toggleMute: function () {
            if (waveSurferInstance.isMuted) {
                // If currently muted then restore to the saved volume
                // and update the mute properties
                waveSurferInstance.backend.setVolume(waveSurferInstance.savedVolume);
                waveSurferInstance.isMuted = false;
            } else {
                // If currently not muted then save current volume,
                // turn off the volume and update the mute properties
                waveSurferInstance.savedVolume = waveSurferInstance.backend.getVolume();
                waveSurferInstance.backend.setVolume(0);
                waveSurferInstance.isMuted = true;
            }
        },

        mark: function (options) {
            var my = waveSurferInstance;

            var opts = WaveSurferUtil.extend({
                id: WaveSurferUtil.getId(),
                width: waveSurferInstance.params.markerWidth
            }, options);

            if (opts.percentage && !opts.position) {
                opts.position = opts.percentage * waveSurferInstance.getDuration();
            }
            opts.percentage = opts.position / waveSurferInstance.getDuration();

            // If exists, just update and exit early
            if (opts.id in waveSurferInstance.markers) {
                waveSurferInstance.markers[opts.id].update(opts);
                return waveSurferInstance.markers[opts.id];
            }

            // Ensure position for a new marker
            if (!opts.position) {
                opts.position = waveSurferInstance.getCurrentTime();
                opts.percentage = opts.position / waveSurferInstance.getDuration();
            }

            var mark = Object.create(Mark);
            mark.init(opts);

            // If we create marker while dragging we are creating selMarks
            if (waveSurferInstance.dragging) {
                mark.on('drag', function (drag) {
                    my.updateSelectionByMark(drag, mark);
                });
            } else {
                mark.on('drag', function (drag) {
                    my.moveMark(drag, mark);
                });
            }

            mark.on('update', function () {
                for (var i = 0; i < my.drawers.length; ++i) {
                    my.drawers[i].updateMark(mark, i);
                }
                my.fireEvent('mark-updated', mark);
            });

            mark.on('remove', function () {
                for (var i = 0; i < my.drawers.length; ++i) {
                    my.drawers[i].removeMark(mark, i);
                }
                delete my.markers[mark.id];
                my.fireEvent('mark-removed', mark);
            });

            for (var i = 0; i < waveSurferInstance.drawers.length; ++i) {
                waveSurferInstance.drawers[i].addMark(mark, i);

                waveSurferInstance.drawers[i].on('mark-over', function (mark, e) {
                    mark.fireEvent('over', e);
                    my.fireEvent('mark-over', mark, e);
                });
                waveSurferInstance.drawers[i].on('mark-leave', function (mark, e) {
                    mark.fireEvent('leave', e);
                    my.fireEvent('mark-leave', mark, e);
                });
                waveSurferInstance.drawers[i].on('mark-click', function (mark, e) {
                    mark.fireEvent('click', e);
                    my.fireEvent('mark-click', mark, e);
                });
            }

            waveSurferInstance.markers[mark.id] = mark;
            waveSurferInstance.fireEvent('marked', mark);

            return mark;
        },

        redrawMarks: function () {
            Object.keys(waveSurferInstance.markers).forEach(function (id) {
                waveSurferInstance.mark(waveSurferInstance.markers[id]);
            }, waveSurferInstance);
        },

        clearMarks: function () {
            Object.keys(waveSurferInstance.markers).forEach(function (id) {
                waveSurferInstance.markers[id].remove();
            }, waveSurferInstance);
            waveSurferInstance.markers = {};
        },

        redrawRegions: function () {
            Object.keys(waveSurferInstance.regions).forEach(function (id) {
                waveSurferInstance.region(waveSurferInstance.regions[id]);
            }, waveSurferInstance);
        },

        clearRegions: function () {
            Object.keys(waveSurferInstance.regions).forEach(function (id) {
                waveSurferInstance.regions[id].remove();
            }, waveSurferInstance);
            waveSurferInstance.regions = {};
        },

        region: function (options) {
            var my = waveSurferInstance;

            var opts = WaveSurferUtil.extend({
                id: WaveSurferUtil.getId()
            }, options);

            opts.startPercentage = opts.startPosition / waveSurferInstance.getDuration();
            opts.endPercentage = opts.endPosition / waveSurferInstance.getDuration();

            // If exists, just update and exit early
            if (opts.id in waveSurferInstance.regions) {
                return waveSurferInstance.regions[opts.id].update(opts);
            }

            var region = Object.create(Region);
            region.init(opts);

            for (var i = 0; i < waveSurferInstance.drawers.length; ++i) {

                region.on('update', function () {
                    my.drawers[i].updateRegion(region);

                    my.fireEvent('region-updated', region);
                });

                region.on('remove', function () {
                    my.drawers[i].removeRegion(region);

                    my.fireEvent('region-removed', region);
                    delete my.regions[region.id];
                });

                waveSurferInstance.drawers[i].addRegion(region);

                waveSurferInstance.drawers[i].on('region-over', function (region, e) {
                    region.fireEvent('over', e);
                    my.fireEvent('region-over', region, e);
                });

                waveSurferInstance.drawers[i].on('region-leave', function (region, e) {
                    region.fireEvent('leave', e);
                    my.fireEvent('region-leave', region, e);
                });

                waveSurferInstance.drawers[i].on('region-click', function (region, e) {
                    region.fireEvent('click', e);
                    my.fireEvent('region-click', region, e);
                });
            }

            waveSurferInstance.regions[region.id] = region;
            waveSurferInstance.fireEvent('region-created', region);

            return region;

        },

        timings: function (offset) {
            var position = waveSurferInstance.getCurrentTime() || 0;
            var duration = waveSurferInstance.getDuration() || 1;
            position = Math.max(0, Math.min(duration, position + (offset || 0)));
            if (!waveSurferInstance.startPosition) { //stores when all started
                waveSurferInstance.startPosition = position;
            }
            waveSurferInstance.actualPosition = position;
            return [position, duration, waveSurferInstance.startPosition];
        },

        // For static audio
        drawBuffer: function () {
            var self = waveSurferInstance;

            function deferredDrawBuffer() {
                if (self.params.fillParent && !self.params.scrollParent) {
                    var length = self.drawers[0].getWidth();
                } else {
                    length = Math.round(
                        self.getDuration() * self.minPxPerSec * self.params.pixelRatio
                    );
                }

                var peaks_list = self.backend.getPeaks(length);

                for (var i = 0; i < self.drawers.length; ++i) {
                    self.drawers[i].drawPeaks(peaks_list[i], length);
                }
                self.redrawMarks();
                self.fireEvent('redraw');
            }

            // Wait for drawers
            if (!waveSurferInstance.drawers) {
                waveSurferInstance.on('drawers-created', function () {
                    deferredDrawBuffer();
                });
                waveSurferInstance.createDrawers();
            } else {
                deferredDrawBuffer();
            }

        },

        // For streaming
        drawAsItPlays: function () {
            var my = waveSurferInstance;
            var peaks;

            waveSurferInstance.drawFrame = function () {
                var duration = my.getDuration();
                var channels = my.getNumberOfChannels();

                for (var i = 0; i < channels; ++i) {
                    var value = WaveSurferUtil.max(my.backend.waveform(i), WebAudio.fftSize);
                    var time = my.getCurrentTime();

                    if ((duration < Infinity) && (time <= duration)) {
                        var length = Math.round(duration * my.minPxPerSec * my.params.pixelRatio);
                        var x = ~~((time / duration) * length);

                        if (!peaks) {
                            peaks = new Uint8Array(length);
                        }
                        // 0 is the default value in Uint8Array
                        if (0 == peaks[x]) {
                            peaks[x] = value;

                            my.drawers[i].setWidth(length);
                            my.drawers[i].clearWave();
                            my.drawers[i].drawWave(peaks, WebAudio.fftSize);
                        }
                    } else {
                        // Time not known
                        if (!peaks) {
                            peaks = [];
                        }

                        if (value < 0) {
                            console.log("Empty value on:" + time);
                        } else {
                            peaks.push(value);
                        }
                        length = peaks.length;

                        my.drawers[i].setWidth(length);
                        my.drawers[i].clearWave();
                        my.drawers[i].drawWave(peaks, WebAudio.fftSize);
                    }
                }

            };
            waveSurferInstance.createDrawers();
            waveSurferInstance.on('progress', waveSurferInstance.drawFrame);
        },

        b64toBlob: function (b64Data, contentType, sliceSize) {
            contentType = contentType || '';
            sliceSize = sliceSize || 512;

            var byteCharacters = atob(b64Data);
            var byteArrays = [];

            for (var offset = 0; offset < byteCharacters.length; offset += sliceSize) {
                var slice = byteCharacters.slice(offset, offset + sliceSize);

                var byteNumbers = new Array(slice.length);
                for (var i = 0; i < slice.length; i++) {
                    byteNumbers[i] = slice.charCodeAt(i);
                }

                var byteArray = new Uint8Array(byteNumbers);

                byteArrays.push(byteArray);
            }

            var blob = new Blob(byteArrays, {type: contentType});
            return blob;
        },

        /**
         * Internal method.
         */
        loadArrayBuffer: function (arraybuffer) {
            var my = waveSurferInstance;

            waveSurferInstance.backend.decodeArrayBuffer(arraybuffer, function (data) {
                my.backend.load(data);
                my.isAudioLoaded = true;
                my.drawBuffer();
                my.fireEvent('ready');
            }, function () {
                my.fireEvent('error', 'Error decoding audiobuffer');
            });
        },

        /**
         * Directly load an externally decoded AudioBuffer.
         */
        loadDecodedBuffer: function (buffer) {
            waveSurferInstance.empty();
            waveSurferInstance.backend.load(buffer);
            waveSurferInstance.isAudioLoaded = true;
            waveSurferInstance.drawBuffer();
            waveSurferInstance.fireEvent('ready');
        },


        /**
         * Loads audio data from a Blob or File object.
         *
         * @param {Blob|File} blob Audio data.
         */
        loadBlob: function (blob) {
            var my = waveSurferInstance;

            // Create file reader
            var reader = new FileReader();
            reader.addEventListener('progress', function (e) {
                my.onProgress(e);
            });
            reader.addEventListener('load', function (e) {
                my.empty();
                my.loadArrayBuffer(e.target.result);
            });
            reader.addEventListener('error', function () {
                my.fireEvent('error', 'Error reading file');
            });
            reader.readAsArrayBuffer(blob);
        },

        /**
         * Loads audio and prerenders its waveform.
         */
        load: function (url) {
            waveSurferInstance.empty();
            // load via XHR and render all at once
            var result = waveSurferInstance.downloadArrayBuffer(url, waveSurferInstance.loadArrayBuffer.bind(waveSurferInstance));
            return result;
        },

        /**
         * Load audio stream and render its waveform as it plays.
         */
        loadStream: function (url) {
            var my = waveSurferInstance;

            waveSurferInstance.empty();

            waveSurferInstance.media = waveSurferInstance.createMedia(url);

            // Assume media.readyState >= media.HAVE_ENOUGH_DATA
            waveSurferInstance.backend.loadMedia(my.media);
            waveSurferInstance.isAudioLoaded = true;

            waveSurferInstance.drawAsItPlays();
            // Here we must delay event dispatch or it may be missed (FF bug)
            setTimeout(waveSurferInstance.fireEvent.bind(waveSurferInstance, 'ready'), 100);
        },

        downloadArrayBuffer: function (url, callback) {
            var my = waveSurferInstance;
            var ajax = WaveSurferUtil.ajax({
                url: url,
                responseType: 'arraybuffer'
            });

            ajax.on('progress', function (e) {
                my.onProgress(e);
            });
            ajax.on('success', callback);
            ajax.on('error', function (e) {
                my.fireEvent('error', 'XHR error: ' + e.target.statusText);
            });
            return ajax;
        },

        onProgress: function (e) {
            if (e.lengthComputable) {
                var percentComplete = e.loaded / e.total;
            } else {
                // Approximate progress with an asymptotic
                // function, and assume downloads in the 1-3 MB range.
                percentComplete = e.loaded / (e.loaded + 1000000);
            }
            waveSurferInstance.fireEvent('loading', Math.round(percentComplete * 100), e.target);
        },

        bindMarks: function () {
            var my = waveSurferInstance;
            var prevTime = 0;

            waveSurferInstance.backend.on('play', function () {
                // Reset marker events
                Object.keys(my.markers).forEach(function (id) {
                    my.markers[id].played = false;
                });
            });

            waveSurferInstance.backend.on('audioprocess', function (time) {
                Object.keys(my.markers).forEach(function (id) {
                    var marker = my.markers[id];
                    if (!marker.played) {
                        if (marker.position <= time && marker.position >= prevTime) {
                            // Prevent firing the event more than once per playback
                            marker.played = true;

                            my.fireEvent('mark', marker);
                            marker.fireEvent('reached');
                        }
                    }
                });
                prevTime = time;
            });
        },

        bindRegions: function () {
            var my = waveSurferInstance;
            waveSurferInstance.backend.on('play', function () {
                Object.keys(my.regions).forEach(function (id) {
                    my.regions[id].fired_in = false;
                    my.regions[id].fired_out = false;
                });
            });
            waveSurferInstance.backend.on('audioprocess', function (time) {
                Object.keys(my.regions).forEach(function (id) {
                    var region = my.regions[id];
                    if (!region.fired_in && region.startPosition <= time && region.endPosition >= time) {
                        my.fireEvent('region-in', region);
                        region.fireEvent('in');
                        region.fired_in = true;
                    }
                    if (!region.fired_out && region.endPosition < time) {
                        my.fireEvent('region-out', region);
                        region.fireEvent('out');
                        region.fired_out = true;
                    }
                });
            });
        },

        /**
         * Display empty waveform.
         */
        empty: function () {
            if (waveSurferInstance.drawFrame) {
                waveSurferInstance.un('progress', waveSurferInstance.drawFrame);
                waveSurferInstance.drawFrame = null;
            }

            if (waveSurferInstance.backend && !waveSurferInstance.backend.isPaused()) {
                waveSurferInstance.stop();
                waveSurferInstance.backend.disconnectSource();
            }
            waveSurferInstance.clearMarks();
            waveSurferInstance.clearRegions();

            if (waveSurferInstance.drawers) {
                for (var i = 0; i < waveSurferInstance.drawers.length; ++i) {
                    waveSurferInstance.drawers[i].setWidth(0);
                    waveSurferInstance.drawers[i].drawPeaks({length: waveSurferInstance.drawers[i].getWidth()}, 0);
                }
            }
        },

        /**
         * Remove events, elements and disconnect WebAudio nodes.
         */
        destroy: function () {
            waveSurferInstance.pause();

            waveSurferInstance.fireEvent('destroy');

            var waveSurferInstanceRef = waveSurferInstance;

            setTimeout(function () {

                waveSurferInstanceRef.backend.destroy(function () {
                    waveSurferInstanceRef.clearMarks();
                    waveSurferInstanceRef.clearRegions();
                    waveSurferInstanceRef.unAll();

                    if (waveSurferInstanceRef.drawers) {
                        for (var i = 0; i < waveSurferInstanceRef.drawers.length; ++i) {
                            waveSurferInstanceRef.drawers[i].destroy();
                        }
                    }

                    waveSurferInstanceRef.backend = null;

                    if (waveSurferInstanceRef.media) {
                        waveSurferInstanceRef.media.src = '';
                        waveSurferInstanceRef.media.removeAttribute("src");
                        waveSurferInstanceRef.container.removeChild(waveSurferInstanceRef.media);
                    }

                    $(waveSurferInstanceRef.wrapper).empty();
                    $(waveSurferInstanceRef.container).empty();

                });

            }, 10000);
        },

        updateSelectionByMark: function (markDrag, mark) {
            var selection;
            if (mark.id == waveSurferInstance.selMark0.id) {
                selection = {
                    'startPercentage': markDrag.endPercentage,
                    'endPercentage': waveSurferInstance.selMark1.percentage
                };
            } else {
                selection = {
                    'startPercentage': waveSurferInstance.selMark0.percentage,
                    'endPercentage': markDrag.endPercentage
                };
            }
            waveSurferInstance.updateSelection(selection);
        },

        updateSelection: function (selection, drawer) {
            var my = waveSurferInstance;
            var percent0 = selection.startPercentage;
            var percent1 = selection.endPercentage;
            var color = waveSurferInstance.params.selectionColor;
            var width = 0;
            if (waveSurferInstance.params.selectionBorder) {
                color = waveSurferInstance.params.selectionBorderColor;
                width = 2; // parametrize?
            }

            if (percent0 > percent1) {
                var tmpPercent = percent0;
                percent0 = percent1;
                percent1 = tmpPercent;
            }

            if (waveSurferInstance.selMark0) {
                waveSurferInstance.selMark0.update({
                    percentage: percent0,
                    position: percent0 * waveSurferInstance.getDuration()
                });
            } else {
                waveSurferInstance.selMark0 = waveSurferInstance.mark({
                    width: width,
                    percentage: percent0,
                    position: percent0 * waveSurferInstance.getDuration(),
                    color: color,
                    draggable: my.params.selectionBorder
                });
            }

            if (waveSurferInstance.selMark1) {
                waveSurferInstance.selMark1.update({
                    percentage: percent1,
                    position: percent1 * waveSurferInstance.getDuration()
                });
            } else {
                waveSurferInstance.selMark1 = waveSurferInstance.mark({
                    width: width,
                    percentage: percent1,
                    position: percent1 * waveSurferInstance.getDuration(),
                    color: color,
                    draggable: my.params.selectionBorder
                });
            }

            if (drawer != null) {
                drawer.updateSelection(percent0, percent1);
                waveSurferInstance.selectedChannel = drawer.channel;
            } else {
                waveSurferInstance.selectedChannel = null;
                for (var i = 0; i < waveSurferInstance.drawers.length; ++i) {
                    waveSurferInstance.drawers[i].updateSelection(percent0, percent1);
                }
            }

            if (waveSurferInstance.loopSelection) {
                waveSurferInstance.backend.updateSelection(percent0, percent1);
            }
            my.fireEvent('selection-update', waveSurferInstance.getSelection());
        },

        moveMark: function (drag, mark) {
            mark.update({
                percentage: drag.endPercentage,
                position: drag.endPercentage * waveSurferInstance.getDuration()
            });
            waveSurferInstance.markers[mark.id] = mark;
        },

        clearSelection: function () {
            for (var i = 0; i < waveSurferInstance.drawers.length; ++i) {
                waveSurferInstance.drawers[i].clearSelection(waveSurferInstance.selMark0, waveSurferInstance.selMark1);
            }
            if (waveSurferInstance.selMark0) {
                waveSurferInstance.selMark0.remove();
                waveSurferInstance.selMark0 = null;
            }
            if (waveSurferInstance.selMark1) {
                waveSurferInstance.selMark1.remove();
                waveSurferInstance.selMark1 = null;
            }

            if (waveSurferInstance.loopSelection) {
                waveSurferInstance.backend.clearSelection();
            }
            waveSurferInstance.fireEvent('selection-update', waveSurferInstance.getSelection());
        },

        toggleLoopSelection: function () {
            waveSurferInstance.loopSelection = !waveSurferInstance.loopSelection;

            if (waveSurferInstance.selMark0) waveSurferInstance.selectionPercent0 = waveSurferInstance.selMark0.percentage;
            if (waveSurferInstance.selMark1) waveSurferInstance.selectionPercent1 = waveSurferInstance.selMark1.percentage;
            waveSurferInstance.updateSelection();
            waveSurferInstance.selectionPercent0 = null;
            waveSurferInstance.selectionPercent1 = null;
        },

        getSelection: function () {
            if (!waveSurferInstance.selMark0 || !waveSurferInstance.selMark1) return null;
            return {
                startPercentage: waveSurferInstance.selMark0.percentage,
                startPosition: waveSurferInstance.selMark0.position,
                endPercentage: waveSurferInstance.selMark1.percentage,
                endPosition: waveSurferInstance.selMark1.position,
                startTime: waveSurferInstance.selMark0.getTitle(),
                endTime: waveSurferInstance.selMark1.getTitle(),
                channel: waveSurferInstance.selectedChannel,
            };
        },

        enableInteraction: function () {
            for (var i = 0; i < waveSurferInstance.drawers.length; ++i) {
                waveSurferInstance.drawers[i].interact = true;
            }
        },

        disableInteraction: function () {
            for (var i = 0; i < waveSurferInstance.drawers.length; ++i) {
                waveSurferInstance.drawers[i].interact = false;
            }
        },

        toggleInteraction: function () {
            for (var i = 0; i < waveSurferInstance.drawers.length; ++i) {
                waveSurferInstance.drawers[i].interact = !waveSurferInstance.drawers[i].interact;
            }
        }
    };
    WaveSurferUtil.extend(waveSurferInstance, WaveSurferObserver);

// retorno do closure, ao ser chamado new WaveSurfer()
    return waveSurferInstance;
};