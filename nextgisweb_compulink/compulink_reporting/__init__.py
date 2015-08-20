# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from nextgisweb.component import Component
from ident import COMP_ID
from .model import Base

@Component.registry.register
class CompulinkReportingComponent(Component):
    identity = COMP_ID
    metadata = Base.metadata

    def initialize(self):
        super(CompulinkReportingComponent, self).initialize()

    def setup_pyramid(self, config):
        super(CompulinkReportingComponent, self).setup_pyramid(config)

        from . import view
        view.setup_pyramid(self, config)


    settings_info = (
    )