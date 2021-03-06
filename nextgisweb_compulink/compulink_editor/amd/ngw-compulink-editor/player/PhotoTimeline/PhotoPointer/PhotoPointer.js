define([
    'dojo/_base/declare',
    'dojo/_base/lang',
    'dojo/_base/array',
    'dojo/topic',
    'ngw/openlayers',
    '../BasePhotoTimeline',
    './ol-controls/PointerControl'
], function (declare, lang, array, topic, openlayers, BasePhotoTimeline,
             PointerControl) {
    return declare([BasePhotoTimeline], {
        _imagesContainerId: 'photoPointerImgs',
        _olControl: null,
        _$lastImg: null,
        _turned: true,

        constructor: function () {
            this._makeOlControl();
        },

        _makeOlControl: function () {
            this._olControl = new PointerControl({
                width: this.PHOTO_WIDTH,
                height: this.PHOTO_HEIGHT,
                FADE_EFFECT_TIME: this.FADE_EFFECT_TIME
            });
        },

        init: function (timeline) {
            this.inherited(arguments);
            this._featureManager.getLayer().map.addControl(this._olControl);
            this._olControl.activate();
        },

        _renderPhoto: function (from, to) {
            this._olControl.renderPhoto(this._getIntervalInfo(to));
        },

        toggle: function (state) {
            if (state === this._turned) return false;

            this._turned = state;
            if (this._turned) {
                this._olControl.activate();
                this._renderPhoto(null, this._timeline.getCurrentTime());
            } else {
                this._olControl.deactivate();
            }
        },

        _mode: null,
        setMode: function (mode) {
            if (this._mode === mode) return true;
            var map = this._featureManager.getLayer().map;
            if (mode === 'first') {
                $(map.div).addClass('photo-pointer-first');
            } else {
                $(map.div).removeClass('photo-pointer-first');
            }
            this._mode = mode;
        }
    });
});
