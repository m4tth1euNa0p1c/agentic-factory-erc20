# syntax=docker/dockerfile:1.7
FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -q -B -ntp dependency:go-offline
COPY src src
RUN mvn -q -B -ntp -DskipTests package && cp target/tela-backend-*.jar /app.jar

FROM eclipse-temurin:25-jre-alpine
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app.jar /app/app.jar
USER app
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=60 CMD wget -qO- http://127.0.0.1:8080/actuator/health/readiness >/dev/null || exit 1
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
