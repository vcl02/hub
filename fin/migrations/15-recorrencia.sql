-- Adiciona o identificador sequencial de recorrência aos lançamentos existentes.
ALTER TABLE fin
ADD COLUMN recorrencia_id integer;

CREATE SEQUENCE fin_recorrencia_seq;

SELECT setval(
    'fin_recorrencia_seq',
    COALESCE(
        (SELECT MAX(recorrencia_id) FROM fin),
        0
    )
);
