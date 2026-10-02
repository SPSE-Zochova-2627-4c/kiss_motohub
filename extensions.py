"""
extensions.py – zdieľané rozšírenia Flasku a správa databázy.

Objekt `db` je v samostatnom súbore, aby ho mohli importovať modely aj
routes bez kruhových importov (app.py -> routes -> app.py).
"""

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text

# SQLAlchemy je ORM: namiesto písania SQL príkazov pracujeme s Python
# triedami (User) a objektmi. SQLAlchemy ich preloží na SQL za nás
# a zároveň nás chráni pred SQL injection (hodnoty posiela oddelene od príkazu).
db = SQLAlchemy()


def upgrade_schema():
    """Jednoduchá "migrácia" databázy.

    db.create_all() vytvorí iba CHÝBAJÚCE TABUĽKY – ak však do existujúcej
    tabuľky pridáme nový stĺpec (napr. profilovku), stará databáza ho nemá.
    Táto funkcia porovná stĺpce v kóde (models.py) so stĺpcami v databáze
    a chýbajúce doplní príkazom ALTER TABLE ... ADD COLUMN.
    Vďaka tomu sa pri novej verzii aplikácie nestratia existujúce účty.

    (Vo veľkých projektoch sa na to používa knižnica Alembic / Flask-Migrate.)
    """
    inspector = inspect(db.engine)
    existing_tables = set(inspector.get_table_names())

    with db.engine.begin() as conn:
        for table in db.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue  # novú tabuľku vytvorí db.create_all()
            existing_cols = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing_cols:
                    continue
                col_type = column.type.compile(dialect=db.engine.dialect)
                ddl = f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {col_type}'
                # Stĺpec, ktorý nesmie byť prázdny, potrebuje predvolenú hodnotu
                # pre už existujúce riadky
                default = getattr(column.default, "arg", None)
                if not column.nullable and default is not None and not callable(default):
                    value = int(default) if isinstance(default, bool) else default
                    ddl += f" NOT NULL DEFAULT {value!r}"
                conn.execute(text(ddl))
