"""Database access for triage, through psycopg locally or the RDS Data API
on AWS.

Both drivers take SQL with psycopg-style named parameters, %(name)s, and
return rows as dicts with the same Python types, so callers never need to
know which one is active. Every statement commits on its own.
"""

import json
import os
import re
import time
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    import psycopg
from psycopg.rows import dict_row

DRIVERS = ("pg", "data-api")


class Db(Protocol):
    def query(self, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]: ...
    def execute(self, sql: str, params: dict[str, Any] | None = None) -> int: ...
    def close(self) -> None: ...


class PgDb:
    def __init__(self, conn: "psycopg.Connection"):
        self.conn = conn

    def query(self, sql, params=None):
        from psycopg.rows import dict_row

        with self.conn.cursor(row_factory=dict_row) as cursor:
            cursor.execute(sql, params)
            return cursor.fetchall()

    def execute(self, sql, params=None):
        with self.conn.cursor() as cursor:
            cursor.execute(sql, params)
            return cursor.rowcount

    def close(self):
        self.conn.close()


# "%(name)s" becomes ":name", and "%(name)s::type" becomes "CAST(:name AS type)"
# so the Data API's parameter parser never sees "::".
NAMED_PARAMETER = re.compile(r"%\((\w+)\)s(?:::(\w+))?")


def to_data_api_sql(sql: str) -> str:
    return NAMED_PARAMETER.sub(
        lambda m: f"CAST(:{m[1]} AS {m[2]})" if m[2] else f":{m[1]}",
        sql,
    )


def to_parameter(name: str, value: Any) -> dict:
    if value is None:
        field = {"isNull": True}
    # bool is checked before int because bool is a subclass of int.
    elif isinstance(value, bool):
        field = {"booleanValue": value}
    elif isinstance(value, int):
        field = {"longValue": value}
    elif isinstance(value, float):
        field = {"doubleValue": value}
    elif isinstance(value, str):
        field = {"stringValue": value}
    elif isinstance(value, datetime):
        field = {"stringValue": value.isoformat()}
    else:
        # The Data API does not accept array parameters; pass lists as JSON.
        raise TypeError(f"Unsupported parameter type for {name}: {type(value).__name__}")
    return {"name": name, "value": field}


def from_field(field: dict, column: dict) -> Any:
    """Converts one returned value to what psycopg would return for the column."""
    if field.get("isNull"):
        return None

    if "arrayValue" in field:
        array = field["arrayValue"]
        for key in ("stringValues", "longValues", "doubleValues", "booleanValues"):
            if key in array:
                return array[key]
        return []

    type_name = column.get("typeName")
    if "stringValue" in field:
        value = field["stringValue"]
        # Data API timestamps look like "2026-10-21 12:00:00.123456" and are UTC.
        if type_name in ("timestamptz", "timestamp"):
            return datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
        if type_name in ("json", "jsonb"):
            return json.loads(value)
        return value

    for key in ("longValue", "doubleValue", "booleanValue"):
        if key in field:
            return field[key]

    raise ValueError(f"Unsupported value in column {column.get('name')}")


def is_resuming(error: Exception) -> bool:
    response = getattr(error, "response", None)
    return isinstance(response, dict) and response.get("Error", {}).get("Code") == "DatabaseResumingException"


class DataApiDb:
    def __init__(
        self,
        client,
        resource_arn: str,
        secret_arn: str,
        database: str,
        retry_delay: float = 5.0,
        max_attempts: int = 12,
    ):
        self.client = client
        self.resource_arn = resource_arn
        self.secret_arn = secret_arn
        self.database = database
        self.retry_delay = retry_delay
        self.max_attempts = max_attempts

    def _run(self, sql: str, params: dict[str, Any] | None) -> dict:
        request = {
            "resourceArn": self.resource_arn,
            "secretArn": self.secret_arn,
            "database": self.database,
            "sql": to_data_api_sql(sql),
            "parameters": [to_parameter(name, value) for name, value in (params or {}).items()],
            "includeResultMetadata": True,
        }
        # A paused cluster rejects calls with DatabaseResumingException until
        # it has resumed, which takes about 15 seconds.
        for attempt in range(1, self.max_attempts + 1):
            try:
                return self.client.execute_statement(**request)
            except Exception as error:
                if not is_resuming(error) or attempt == self.max_attempts:
                    raise
                time.sleep(self.retry_delay)
        raise AssertionError("unreachable")

    def query(self, sql, params=None):
        response = self._run(sql, params)
        columns = response.get("columnMetadata", [])
        return [
            {
                column.get("label") or column.get("name"): from_field(field, column)
                for field, column in zip(record, columns)
            }
            for record in response.get("records", [])
        ]

    def execute(self, sql, params=None):
        return self._run(sql, params).get("numberOfRecordsUpdated", 0)

    def close(self):
        self.client.close()


def connect(driver: str | None = None, database: str | None = None) -> Db:
    """Opens the database chosen by driver, or by DB_DRIVER when driver is None.

    database overrides the database name from the environment.
    """
    driver = driver or os.environ.get("DB_DRIVER", "pg")

    if driver == "pg":
        import psycopg
        
        conn = psycopg.connect(
            host=os.environ["DB_HOST"],
            port=os.environ["DB_PORT"],
            user=os.environ["POSTGRES_USER"],
            password=os.environ["POSTGRES_PASSWORD"],
            dbname=database or os.environ["POSTGRES_DB"],
            autocommit=True,
        )
        return PgDb(conn)

    if driver == "data-api":
        import boto3

        return DataApiDb(
            boto3.client("rds-data"),
            resource_arn=os.environ["DB_CLUSTER_ARN"],
            secret_arn=os.environ["DB_SECRET_ARN"],
            database=database or os.environ["DB_NAME"],
        )

    raise ValueError(f'DB driver must be "pg" or "data-api", got "{driver}"')