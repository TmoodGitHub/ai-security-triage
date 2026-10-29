from datetime import datetime, timezone

import pytest
from botocore.exceptions import ClientError

from triage.drivers import DataApiDb, from_field, to_data_api_sql, to_parameter

class FakeRdsData:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def execute_statement(self, **request):
        self.requests.append(request)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def resuming_error():
    return ClientError(
        {"Error": {"Code": "DatabaseResumingException", "Message": "resuming"}},
        "ExecuteStatement",
    )

def make_db(client, **options):
    return DataApiDb(client, "cluster-arn", "secret-arn", "triage", retry_delay=0, **options)

def test_to_data_api_sql_rewrites_named_parameters_and_casts():
    assert (
        to_data_api_sql("WHERE id = %(id)s AND raw = %(raw)s::jsonb") == "WHERE id = :id AND raw = CAST(:raw AS jsonb)"
    )

def test_to_parameter_maps_python_types():
    assert to_parameter("a", "high") == {"name": "a", "value": {"stringValue": "high"}}
    assert to_parameter("a", 5)["value"] == {"longValue": 5}
    assert to_parameter("a", 0.5)["value"] == {"doubleValue": 0.5}
    assert to_parameter("a", True)["value"] == {"booleanValue": True}
    assert to_parameter("a", None)["value"] == {"isNull": True}


def test_to_parameter_rejects_list():
    with pytest.raises(TypeError, match="evidence"):
        to_parameter("evidence", ["a"])


def test_from_field_matches_psycopg_types():
    assert from_field(
        {"stringValue": "2026-10-21 12:00:00.5"}, {"typeName": "timestamptz"}
    ) == datetime(2026, 10, 21, 12, 0, 0, 500000, tzinfo=timezone.utc)
    assert from_field({"stringValue": '{"a": 1}'}, {"typeName": "jsonb"}) == {"a": 1}
    assert from_field({"arrayValue": {"stringValues": ["x"]}}, {"typeName": "_text"}) == ["x"]
    assert from_field({"longValue": 7}, {"typeName": "int8"}) == 7
    assert from_field({"isNull": True}, {"typeName": "text"}) is None


def test_query_builds_rows_from_column_labels():
    client = FakeRdsData([
        {
            "columnMetadata": [
                {"label": "event_id", "typeName": "text"},
                {"label": "success", "typeName": "bool"},
            ],
            "records": [[{"stringValue": "event-1"}, {"booleanValue": False}]],
        }
    ])

    rows = make_db(client).query("SELECT ... WHERE id = %(id)s", {"id": 1})

    assert rows == [{"event_id": "event-1", "success": False}]
    assert client.requests[0]["sql"] == "SELECT ... WHERE id = :id"
    assert client.requests[0]["parameters"] == [{"name": "id", "value": {"longValue": 1}}]


def test_query_retries_while_the_database_resumes():
    client = FakeRdsData([resuming_error(), resuming_error(), {"records": []}])

    assert make_db(client).query("SELECT 1") == []
    assert len(client.requests) == 3


def test_query_gives_up_after_the_last_attempt():
    client = FakeRdsData([resuming_error(), resuming_error()])

    with pytest.raises(ClientError):
        make_db(client, max_attempts=2).query("SELECT 1")


def test_execute_returns_rows_changed():
    client = FakeRdsData([{"numberOfRecordsUpdated": 1}])

    assert make_db(client).execute("INSERT ...") == 1