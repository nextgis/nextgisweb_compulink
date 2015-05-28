# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import scoped_session, sessionmaker
from zope.sqlalchemy import ZopeTransactionExtension


from nextgisweb.component import Component
from ident import COMP_ID

DBSession = scoped_session(sessionmaker(extension=ZopeTransactionExtension()))
Base = declarative_base()

@Component.registry.register
class CompulinkMssqlBridgeComponent(Component):
    identity = COMP_ID
    metadata = Base.metadata

    def initialize(self):
        super(CompulinkMssqlBridgeComponent, self).initialize()

    def setup_pyramid(self, config):

        conn_str = self._settings.get('conn_str', 'no')

        self.engine = create_engine(conn_str)

        DBSession.configure(bind=self.engine)
        Base.metadata.bind = self.engine

        self.DBSession = DBSession
        self.Base = Base

        from . import view
        view.setup_pyramid(self, config)

    settings_info = (
        dict(key='conn_str', desc=u"Строка соединения с MS SQL Server"),
    )