# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from nextgisweb import Base

from nextgisweb.component import Component

from .ident import COMP_ID
from .command import Command

class CompulinkVideoProducerComponent(Component):
    identity = COMP_ID
    metadata = Base.metadata

    def initialize(self):
        super(CompulinkVideoProducerComponent, self).initialize()

    def setup_pyramid(self, config):
        super(CompulinkVideoProducerComponent, self).setup_pyramid(config)

        from . import view
        view.setup_pyramid(self, config)

    settings_info = (
        dict(key='browser_driver', desc=u"Драйвер браузера. Может быть 'phantomjs' или 'firefox'. Второй только для тестов!"),
        dict(key='video_rec_user', desc=u"Пользователь, из под которого происходит запись"),
        dict(key='video_rec_pass', desc=u"Пароль пользователя"),
    )
