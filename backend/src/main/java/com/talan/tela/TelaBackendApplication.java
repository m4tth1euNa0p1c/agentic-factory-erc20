package com.talan.tela;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties(TelaProperties.class)
public class TelaBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(TelaBackendApplication.class, args);
    }
}
