define([
    'dojo/_base/declare',
    'dojo/_base/array'
], function (declare, array) {
    return declare(null, {
        pointerControl: null,

        constructor: function (pointerControl) {
            this.pointerControl = pointerControl;
        },

        _countImageContainers: null,

        getImageContainer: function () {
            var imageContainersCount = this._getImageContainersCount(),
                min = 0,
                max = imageContainersCount - 1,
                imageContainerIndex;

            imageContainerIndex = Math.floor(Math.random() * (max - min + 1)) + min;

            return this.pointerControl._imageContainers[imageContainerIndex];
        },

        _getImageContainersCount: function () {
            if (!this._countImageContainers) {
                this._countImageContainers = this.pointerControl._imageContainers.length;
            }
            return this._countImageContainers;
        }
    });
});
