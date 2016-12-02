define([
    'dojo/_base/window',
    'dojo/_base/declare',
    'dojo/_base/lang',
    'dojo/_base/array',
    'dojo/dom-construct',
    'dojo/dom-class',
    'dojo/dom',
    'dojo/query',
    'dojo/on',
    'dojo/topic',
    'dojox/layout/FloatingPane',
    'dijit/form/Select',
    'ngw-compulink-libs/mustache/mustache',
    'ngw-compulink-libs/vis-4.16.1/vis.min',
    'dojo/text!./templates/Timeline.mustache',
    'ngw-compulink-editor/player/AudioManager',
    'ngw-compulink-editor/player/utils/ButtonClickHandler',
    'xstyle/css!./templates/Timeline.css',
    'xstyle/css!dojox/layout/resources/FloatingPane.css',
    'xstyle/css!dojox/layout/resources/ResizeHandle.css',
    'xstyle/css!ngw-compulink-libs/font-awesome-4.6.3/css/font-awesome.min.css',
    'xstyle/css!ngw-compulink-libs/vis-4.16.1/vis.min.css',
    'ngw-compulink-libs/moment/moment-with-locales.min'
], function (win, declare, lang, array, domConstruct, domClass, dom, query, on,
             topic, FloatingPane, Select, mustache, vis, template, AudioManager, ButtonClickHandler) {
    return declare([], {
        _timelineWidgetDiv: null,
        _barId: 'currentTime',
        _featureManager: null,
        _countUnitSelector: null,
        _countUnits: [
            {label: '1', value: '1'},
            {label: '2', value: '2'},
            {label: '5', value: '5'},
            {label: '10', value: '10'},
            {label: '15', value: '15'},
            {label: '30', value: '30'},
            {label: '60', value: '60'},
            {label: '90', value: '90'}
        ],
        _unitsSelector: null,
        _units: [
            {label: 'минут(а)', value: 'Minutes'},
            {label: 'час(ов)', value: 'Hours'},
            {label: 'день(дней)', value: 'Days'},
            {label: 'месяц(ев)', value: 'Months'}
        ],
        _audio: null,

        constructor: function () {
            mustache.parse(template);
            this._bindEvents();
            this._audio = new AudioManager();
        },

        initAudioManager: function () {
            return this._audio.init();
        },

        _bindEvents: function () {
            topic.subscribe('features/manager/filled', lang.hitch(this, function (featureManager) {
                this._buildFloatingPane();
                this._buildTimeline(featureManager);
                this._buildSpeedSelectors();
                this._setOptimalSpeed();
            }));
        },

        _buildFloatingPane: function () {
            var floatingDiv = domConstruct.create('div', {id: 'timeline'}, win.body()),
                htmlContent = mustache.render(template);
            this._dialog = new FloatingPane({
                title: 'Плеер',
                content: htmlContent,
                closable: false,
                resizable: true,
                dockable: false,
                maxable: false,
                style: 'position:absolute;top:100px;left:100px;width:500px;height:160px;visibility:hidden;'
            }, floatingDiv);
            this._dialog.startup();
            this._dialog.show();
            this._dialog.bringToTop();

            this._timelineWidgetDiv = document.getElementById('timelineWidget');
        },

        _buildTimeline: function (featureManager) {
            var dataSetItems = [];

            this._featureManager = featureManager;

            array.forEach(featureManager._layer.features, function (feature) {
                dataSetItems.push({
                    id: feature.id,
                    content: '',
                    start: feature.attributes.built_date
                });
            });

            dataSetItems.push({
                id: 'rangeBuilt',
                content: '',
                start: featureManager.minBuiltDate,
                end: featureManager.maxBuiltDate
            });


            var options = {
                height: '100px',
                locale: 'ru',
                stack: false,
                selectable: false
            };

            var timeline = new vis.Timeline(this._timelineWidgetDiv, new vis.DataSet(dataSetItems), options);

            timeline.addCustomTime(new Date(featureManager.minBuiltDate), this._barId);

            timeline.on('click', lang.hitch(this, function (timeChangedEvent) {
                this._handleTimeChanged(timeChangedEvent);
            }));

            timeline.on('timechanged', lang.hitch(this, function (timeChangedEvent) {
                this._handleTimeChanged(timeChangedEvent);
            }));

            this._timeline = timeline;
            this._bindPlayerControlsEvents();
            this._moveTimeBarToStart();
        },

        _handleTimeChanged: function (timeChangedEvent) {
            this.stop();
            this._timeline.setCustomTime(timeChangedEvent.time, this._barId);
            var minDate = timeChangedEvent.time < this._featureManager.minBuiltDate ?
                new Date(0) :
                this._featureManager.minBuiltDate;
            this._handleControlsState(timeChangedEvent.time);
            this._buildFeatures(minDate, timeChangedEvent.time, true);
        },

        _handleControlsState: function (time) {
            if (time == this._featureManager.minBuiltDate) {
                this._buttonsHandlers.play.enable();
                this._buttonsHandlers.forward.enable();
                this._buttonsHandlers.backward.disable();
            }
            if (time == this._featureManager.maxBuiltDate) {
                this._buttonsHandlers.play.disable();
                this._buttonsHandlers.forward.disable();
                this._buttonsHandlers.backward.enable();
            }
            if ((this._featureManager.minBuiltDate < time) &&
                (time < this._featureManager.maxBuiltDate)) {
                if (this._state === 'playing') {
                    this._buttonsHandlers.play.disable();
                } else {
                    this._buttonsHandlers.play.enable();
                }
                this._buttonsHandlers.forward.enable();
                this._buttonsHandlers.backward.enable();
            }
            if (time > this._featureManager.maxBuiltDate) {
                this._buttonsHandlers.play.disable();
                this._buttonsHandlers.forward.enable();
                this._buttonsHandlers.backward.enable();
            }
            if (time < this._featureManager.minBuiltDate) {
                this._buttonsHandlers.play.enable();
                this._buttonsHandlers.forward.enable();
                this._buttonsHandlers.backward.enable();
            }
        },

        _buttonsHandlers: {},

        _bindPlayerControlsEvents: function () {
            this._buttonsHandlers.play = new ButtonClickHandler(
                query('i.fa-play-circle', this._dialog.domNode)[0],
                lang.hitch(this, function () {
                    this.play(this._timeline.getCustomTime(this._barId));
                }),
                true
            );

            this._buttonsHandlers.backward = new ButtonClickHandler(
                query('i.fa-fast-backward', this._dialog.domNode)[0],
                lang.hitch(this, function () {
                    this._moveTimeBarToStart();
                }),
                true
            );

            this._buttonsHandlers.forward = new ButtonClickHandler(
                query('i.fa-fast-forward', this._dialog.domNode)[0],
                lang.hitch(this, function () {
                    this._handleTimeChanged({
                        time: this._featureManager.maxBuiltDate
                    });
                }),
                true
            );

            on(query('i.fa-stop-circle', this._dialog.domNode), 'click', lang.hitch(this, function () {
                this.stop();
            }));

            on(query('i.sound', this._dialog.domNode), 'click', lang.hitch(this, function () {
                var volumeBtn = query('i.sound', this._dialog.domNode)[0];
                domClass.toggle(volumeBtn, 'fa-volume-up');
                domClass.toggle(volumeBtn, 'fa-volume-off');
                if (domClass.contains(volumeBtn, 'fa-volume-up')) {
                    this._activateSound();
                } else {
                    this._audio.deactivate();
                }
            }));

            on(query('i.photo', this._dialog.domNode), 'click', lang.hitch(this, function () {
                var photoBtn = query('i.photo', this._dialog.domNode)[0];
                domClass.toggle(photoBtn, 'fa-eye');
                domClass.toggle(photoBtn, 'fa-low-vision');
                if (domClass.contains(photoBtn, 'fa-eye')) {
                    console.log('photo on');
                } else {
                    console.log('photo off');
                }
            }));
        },

        _activateSound: function () {
            this._audio.activate();

            if (this._state !== 'playing') return false;

            var units = this._unitsSelector.get('value'),
                countUnits = parseInt(this._countUnitSelector.get('value'), 10),
                start = this._timeline.getCustomTime(this._barId),
                currentTips = this._getCurrentTips(start, units, countUnits);

            this._audio.play(currentTips);
        },

        _moveTimeBarToStart: function () {
            this._handleTimeChanged({
                time: this._featureManager.minBuiltDate
            });
        },

        _buildSpeedSelectors: function () {
            this._unitsSelector = new Select({
                name: 'unitsSelector',
                options: this._units
            });
            this._unitsSelector.placeAt(dom.byId('unitsSelector')).startup();

            this._unitsSelector.on('change', lang.hitch(this, function (changedEvent) {
                this.stop();
            }));

            this._countUnitSelector = new Select({
                name: 'countUnitSelector',
                options: this._countUnits
            });
            this._countUnitSelector.placeAt(dom.byId('countUnitSelector')).startup();

            this._countUnitSelector.on('change', lang.hitch(this, function (changedEvent) {
                this.stop();
            }));
        },

        _setOptimalSpeed: function () {
            var diffMs = this._featureManager.maxBuiltDate.getTime() -
                    this._featureManager.minBuiltDate.getTime(),
                months = Math.round(diffMs / 2592000000),
                days = Math.round(diffMs / 86400000),
                hours = Math.round(diffMs / 3600000),
                minutes = Math.round(diffMs / 60000);
            if (months > 0) {
                if (months > 1 && months <= 5) {
                    this._unitsSelector.set('value', 'Days');
                    this._countUnitSelector.set('value', '10');
                    return true;
                } else if (months > 5 && months <= 8) {
                    this._unitsSelector.set('value', 'Days');
                    this._countUnitSelector.set('value', '15');
                    return true;
                } else if (months > 8 && months < 30) {
                    this._unitsSelector.set('value', 'Months');
                    this._countUnitSelector.set('value', '1');
                    return true;
                } else if (months >= 30 && months < 90) {
                    this._unitsSelector.set('value', 'Months');
                    this._countUnitSelector.set('value', '5');
                    return true;
                } else if (months > 90) {
                    this._unitsSelector.set('value', 'Months');
                    this._countUnitSelector.set('value', '10');
                    return true;
                }
            }
            if (days > 0) {
                if (days > 20 && days <= 35) {
                    this._unitsSelector.set('value', 'Days');
                    this._countUnitSelector.set('value', '2');
                    return true;
                } else if (days > 10 && days <= 20) {
                    this._unitsSelector.set('value', 'Days');
                    this._countUnitSelector.set('value', '1');
                    return true;
                } else if (days > 5 && days <= 10) {
                    this._unitsSelector.set('value', 'Hours');
                    this._countUnitSelector.set('value', '15');
                    return true;
                } else if (days > 1 && days <= 5) {
                    this._unitsSelector.set('value', 'Hours');
                    this._countUnitSelector.set('value', '5');
                    return true;
                }
            }
            if (hours > 0) {
                if (hours > 24 && hours <= 48) {
                    this._unitsSelector.set('value', 'Hours');
                    this._countUnitSelector.set('value', '2');
                    return true;
                } else if (hours > 10 && hours <= 24) {
                    this._unitsSelector.set('value', 'Hours');
                    this._countUnitSelector.set('value', '1');
                    return true;
                } else if (hours > 5 && hours <= 10) {
                    this._unitsSelector.set('value', 'Minutes');
                    this._countUnitSelector.set('value', '30');
                    return true;
                } else if (hours > 1 && hours <= 5) {
                    this._unitsSelector.set('value', 'Minutes');
                    this._countUnitSelector.set('value', '15');
                    return true;
                }
            }
            if (minutes > 0) {
                if (minutes > 60 && minutes <= 120) {
                    this._unitsSelector.set('value', 'Minutes');
                    this._countUnitSelector.set('value', '10');
                    return true;
                } else if (minutes > 30 && minutes <= 60) {
                    this._unitsSelector.set('value', 'Minutes');
                    this._countUnitSelector.set('value', '2');
                    return true;
                }
            }
            return false;
        },

        _state: 'wait',
        _interval: null,
        play: function (start) {
            this._state = 'playing';
            this._buttonsHandlers.play.disable();
            if (start < this._featureManager.minBuiltDate) {
                this._moveTimeBarToStart();
                start = this._featureManager.minBuiltDate;
            }
            var tick = 1,
                units = this._unitsSelector.get('value'),
                countUnits = parseInt(this._countUnitSelector.get('value'), 10),
                intervalTimeByTick,
                currentTips;

            currentTips = this._getCurrentTips(start, units, countUnits);
            this._audio.play(currentTips);

            this._interval = setInterval(lang.hitch(this, function () {
                intervalTimeByTick = this._getIntervalTimeByTick(start, tick, units, countUnits);
                tick++;
                if (intervalTimeByTick.to > this._featureManager.maxBuiltDate) {
                    intervalTimeByTick.to = this._featureManager.maxBuiltDate;
                    this.stop();
                }
                this._handleControlsState(intervalTimeByTick.to);
                this._timeline.setCustomTime(intervalTimeByTick.to, this._barId);
                this._buildFeatures(intervalTimeByTick.from, intervalTimeByTick.to);
            }), 1000);
        },

        _getCurrentTips: function (position, units, countUnits) {
            var intervalMs = this._getIntervalTime(units, countUnits),
                positionInMs = position.getTime(),
                currentDuration,
                currentTips;

            currentDuration = positionInMs - this._featureManager.minBuiltDate.getTime();
            currentTips = currentDuration / intervalMs;
            currentTips = currentTips - (currentTips % 1);

            return currentTips;
        },

        _getIntervalTime: function (units, countUnits) {
            var interval = this._getIntervalTimeByTick(this._featureManager.minBuiltDate, 1, units, countUnits);
            return interval.to.getTime() - interval.from.getTime();
        },

        _getIntervalTimeByTick: function (startDate, tick, units, countUnits) {
            return {
                from: this['add' + units](startDate, (tick - 1) * countUnits),
                to: this['add' + units](startDate, tick * countUnits)
            }
        },

        addMinutes: function (date, minutes) {
            var clonedDate = new Date(date.getTime());
            clonedDate.setMinutes(clonedDate.getMinutes() + minutes);
            return clonedDate;
        },

        addHours: function (date, hours) {
            var clonedDate = new Date(date.getTime());
            clonedDate.setHours(clonedDate.getHours() + hours);
            return clonedDate;
        },

        addMonths: function (date, months) {
            var clonedDate = new Date(date.getTime());
            clonedDate.setMonth(clonedDate.getMonth() + months);
            return clonedDate;
        },

        addDays: function (date, days) {
            var clonedDate = new Date(date.getTime());
            clonedDate.setDate(clonedDate.getDate() + days);
            return clonedDate;
        },

        stop: function () {
            if (this._interval) {
                clearInterval(this._interval);
            }
            this._state = 'wait';
            this._buttonsHandlers.play.enable();
            this._audio.stop();
        },

        _currentIndexDate: null,
        _buildFeatures: function (from, to, isNeedRebuild) {
            var layer = this._featureManager._layer,
                featureBuiltDateMs,
                featuresToDrawing = [];

            if (isNeedRebuild) {
                layer.removeAllFeatures();
            }

            from = from.getTime();
            to = to ? to.getTime() : from;

            if (to < from) {
                var newFrom = to;
                to = from;
                from = newFrom;
            }

            if (from === this._featureManager.minBuiltDate.getTime()) {
                from = 0;
            }
            array.forEach(this._featureManager._featuresByBuiltDate, function (feature, index) {
                featureBuiltDateMs = feature.attributes.built_date_ms;
                if (featureBuiltDateMs <= from) {
                    return true;
                } else if (featureBuiltDateMs > from && featureBuiltDateMs <= to) {
                    featuresToDrawing.push(feature);
                } else if (featureBuiltDateMs > to) {
                    this._currentIndexDate = index - 1;
                    return false;
                }
            }, this);
            this._renderByTimeChunks(layer, featuresToDrawing);
        },

        _renderByTimeChunks: function (layer, featuresToDrawing) {
            var chunksInSec = 5,
                indexTimeChunk = 0,
                chunkFeatures,
                countInTimeChunk,

                featuresToDrawingCount = featuresToDrawing.length;

            if (featuresToDrawingCount > 0) {
                countInTimeChunk = Math.ceil(featuresToDrawingCount / chunksInSec);
                for (indexTimeChunk; indexTimeChunk < chunksInSec; indexTimeChunk++) {
                    setTimeout(function (index) {
                        return function () {
                            chunkFeatures = featuresToDrawing.slice(
                                index * countInTimeChunk,
                                (index + 1) * countInTimeChunk
                            );
                            layer.addFeatures(chunkFeatures);
                        };
                    }(indexTimeChunk), 1000 * (indexTimeChunk / chunksInSec));
                }
            }

        },

        _normalizeDateToDay: function (dateTime) {
            if (dateTime.getHours() !== 0 || dateTime.getMinutes() !== 0 || dateTime.getSeconds() !== 0) {
                dateTime.setDate(dateTime.getDate() + 1);
            }
            dateTime.setHours(0, 0, 0, 0);
            return dateTime;
        },

        _addDays: function (date, days) {
            var result = new Date(date);
            result.setDate(result.getDate() + days);
            return result;
        }
    });
});